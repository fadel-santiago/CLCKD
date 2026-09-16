import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { discoverMigrationPairs } from "../../src/lib/db/migrations";

/** Create a temp migrations dir and write the given filenames (empty bodies). */
function makeMigrationsDir(names: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-migrations-"));
  for (const name of names) {
    fs.writeFileSync(path.join(dir, name), `-- ${name}\n`);
  }
  return dir;
}

describe("Batch 1B2A — migration catalog discovery", () => {
  const tempDirs: string[] = [];

  function discover(names: string[]) {
    const dir = makeMigrationsDir(names);
    tempDirs.push(dir);
    return discoverMigrationPairs(dir);
  }

  afterAll(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("discovers valid pairs and orders them numerically by version", () => {
    const catalog = discover([
      "0003_add_users.down.sql",
      "0003_add_users.up.sql",
      "0010_seed_categories.up.sql",
      "0010_seed_categories.down.sql",
      "0002_create_projects.down.sql",
      "0002_create_projects.up.sql",
    ]);

    expect(catalog.map((p) => p.version)).toEqual([2, 3, 10]);
    // Numeric (not lexicographic): 0002 < 0003 < 0010.
    expect(catalog[2].version).toBeGreaterThan(catalog[1].version);
  });

  it("returns up/down paths that match the correct pair", () => {
    const dir = makeMigrationsDir([
      "0001_initial.up.sql",
      "0001_initial.down.sql",
      "0002_create_projects.up.sql",
      "0002_create_projects.down.sql",
    ]);
    tempDirs.push(dir);

    const catalog = discoverMigrationPairs(dir);
    expect(catalog).toHaveLength(2);

    expect(catalog[0]).toEqual({
      version: 1,
      name: "initial",
      upPath: path.join(dir, "0001_initial.up.sql"),
      downPath: path.join(dir, "0001_initial.down.sql"),
    });
    expect(catalog[1]).toEqual({
      version: 2,
      name: "create_projects",
      upPath: path.join(dir, "0002_create_projects.up.sql"),
      downPath: path.join(dir, "0002_create_projects.down.sql"),
    });
  });

  it("rejects an orphan up file (missing down)", () => {
    expect(() => discover(["0001_initial.up.sql"])).toThrow(
      /orphan.*0001_initial\.up\.sql/i
    );
    expect(() =>
      discover(["0001_initial.up.sql", "0002_ok.down.sql", "0002_ok.up.sql"])
    ).toThrow(/orphan/);
  });

  it("rejects an orphan down file (missing up)", () => {
    expect(() => discover(["0001_initial.down.sql"])).toThrow(
      /orphan.*0001_initial\.down\.sql/i
    );
  });

  it("rejects duplicate numeric versions, even with different names", () => {
    // Same version, different names — must be rejected.
    expect(() =>
      discover([
        "0002_first.up.sql",
        "0002_first.down.sql",
        "0002_second.up.sql",
        "0002_second.down.sql",
      ])
    ).toThrow(/duplicate.*version 0002/i);

    // A second file reusing the same version slot for the same direction
    // cannot exist as two files, so exercise via a shared-version collision:
    expect(() =>
      discover([
        "0001_a.up.sql",
        "0001_a.down.sql",
        "0001_b.up.sql",
      ])
    ).toThrow(/duplicate.*version 0001/i);
  });

  it("rejects a pair whose up and down files disagree on name", () => {
    // Same version, different names — the pair is invalid and must throw.
    expect(() => discover(["0001_a.up.sql", "0001_b.down.sql"])).toThrow(
      /name mismatch.*version 0001/i
    );
    expect(() => discover(["0003_x.up.sql", "0003_y.down.sql"])).toThrow(
      /must share the same migration name/i
    );
  });

  it("rejects version 0000 (the unmigrated ledger baseline)", () => {
    expect(() => discover(["0000_initial.up.sql", "0000_initial.down.sql"])).toThrow(
      /invalid migration version 0000.*unmigrated ledger baseline/i
    );
    // An orphan at version 0 is also rejected (baseline check first).
    expect(() => discover(["0000_baseline.up.sql"])).toThrow(
      /invalid migration version 0000/i
    );
    // Versions 0001 and 9999 remain valid.
    const catalog = discover([
      "0001_first.up.sql",
      "0001_first.down.sql",
      "9999_last.up.sql",
      "9999_last.down.sql",
    ]);
    expect(catalog.map((p) => p.version)).toEqual([1, 9999]);
  });

  it("returns absolute up/down paths for a relative migrationsDir", () => {
    const dir = makeMigrationsDir(["0001_initial.up.sql", "0001_initial.down.sql"]);
    tempDirs.push(dir);

    // A genuinely relative path from the current working directory.
    const cwd = process.cwd();
    const relativeDir = path.relative(cwd, dir);
    expect(path.isAbsolute(relativeDir)).toBe(false);

    // Pass the relative path as-is: resolve() inside discoverMigrationPairs
    // must anchor it to the current working directory and return absolute paths.
    const catalog = discoverMigrationPairs(relativeDir);
    expect(catalog).toHaveLength(1);
    expect(path.isAbsolute(catalog[0].upPath)).toBe(true);
    expect(path.isAbsolute(catalog[0].downPath)).toBe(true);
    expect(catalog[0].upPath).toBe(path.join(dir, "0001_initial.up.sql"));
    expect(catalog[0].downPath).toBe(path.join(dir, "0001_initial.down.sql"));
  });

  it("rejects malformed migration filenames ending in .up.sql / .down.sql", () => {
    // Three-digit version.
    expect(() => discover(["001_initial.up.sql"])).toThrow(/malformed/);
    // Five-digit version.
    expect(() => discover(["00001_initial.down.sql"])).toThrow(/malformed/);
    // Missing name segment.
    expect(() => discover(["0001_.up.sql"])).toThrow(/malformed/);
    // Dashed name (not a word character).
    expect(() => discover(["0001_my-name.up.sql"])).toThrow(/malformed/);
    // Underscore-only version, no name.
    expect(() => discover(["_initial.up.sql"])).toThrow(/malformed/);
  });

  it("returns an empty catalog for an empty directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-migrations-empty-"));
    tempDirs.push(dir);
    expect(discoverMigrationPairs(dir)).toEqual([]);
  });

  it("ignores unrelated ordinary files in the directory", () => {
    const catalog = discover([
      "README.md",
      ".DS_Store",
      "notes.txt",
      "0001_initial.up.sql",
      "0001_initial.down.sql",
    ]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].version).toBe(1);
  });
});
