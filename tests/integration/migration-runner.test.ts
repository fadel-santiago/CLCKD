import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  discoverMigrationPairs,
  runPendingMigrations,
} from "../../src/lib/db/migrations";
import { SCHEMA_VERSION_KEY } from "../../src/lib/db/schema-version";

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

describe("Batch 1B2B — transactional forward migration execution", () => {
  const tempDirs: string[] = [];
  const openDbs: Database.Database[] = [];

  /** Open a temp SQLite file, tracked for cleanup. */
  function makeDb(): Database.Database {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-migdb-"));
    tempDirs.push(dir);
    const db = new Database(path.join(dir, "test.db"));
    openDbs.push(db);
    return db;
  }

  /** Create a temp migrations dir with explicit up SQL contents. */
  function makeCatalog(pairs: Record<string, string | null>): string {
    // key: "0001_name" → up SQL body (down files always created empty)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-migexec-"));
    tempDirs.push(dir);
    for (const [key, upSql] of Object.entries(pairs)) {
      if (upSql !== null) {
        fs.writeFileSync(path.join(dir, `${key}.up.sql`), upSql);
      }
      fs.writeFileSync(path.join(dir, `${key}.down.sql`), `-- down ${key}\n`);
    }
    return dir;
  }

  function ledgerValue(db: Database.Database): string {
    const row = db
      .prepare(`SELECT value FROM kv_meta WHERE key = ?`)
      .get(SCHEMA_VERSION_KEY) as { value: string };
    return row.value;
  }

  function tableExists(db: Database.Database, name: string): boolean {
    return (
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) !==
      undefined
    );
  }

  afterAll(() => {
    for (const db of openDbs) {
      try {
        db.close();
      } catch {
        // already closed
      }
    }
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("bootstraps version 0 and returns a no-op for an empty catalog", () => {
    const db = makeDb();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-migempty-"));
    tempDirs.push(dir);

    const result = runPendingMigrations(db, dir);
    expect(result).toEqual({ startingVersion: 0, endingVersion: 0, appliedVersions: [] });
    // Ledger was bootstrapped to the unmigrated baseline.
    expect(ledgerValue(db)).toBe("0");
  });

  it("applies multiple pending migrations in ascending order", () => {
    const db = makeDb();
    const dir = makeCatalog({
      "0003_third": `CREATE TABLE t3 (id INTEGER);`,
      "0001_first": `CREATE TABLE t1 (id INTEGER); INSERT INTO t1 (id) VALUES (1);`,
      "0002_second": `CREATE TABLE t2 (id INTEGER);`,
    });

    runPendingMigrations(db, dir);

    expect(tableExists(db, "t1")).toBe(true);
    expect(tableExists(db, "t2")).toBe(true);
    expect(tableExists(db, "t3")).toBe(true);
    expect(ledgerValue(db)).toBe("3");
  });

  it("returns the correct MigrationRunResult", () => {
    const db = makeDb();
    const dir = makeCatalog({
      "0001_first": `CREATE TABLE t1 (id INTEGER);`,
      "0002_second": `CREATE TABLE t2 (id INTEGER);`,
      "0010_tenth": `CREATE TABLE t10 (id INTEGER);`,
    });

    const result = runPendingMigrations(db, dir);
    expect(result.startingVersion).toBe(0);
    expect(result.endingVersion).toBe(10);
    expect(result.appliedVersions).toEqual([1, 2, 10]);
  });

  it("only applies versions newer than the stored version", () => {
    const db = makeDb();
    const dir = makeCatalog({
      "0001_first": `CREATE TABLE t1 (id INTEGER);`,
      "0002_second": `CREATE TABLE t2 (id INTEGER);`,
      "0003_third": `CREATE TABLE t3 (id INTEGER);`,
    });

    // Simulate a ledger already at version 2.
    runPendingMigrations(db, dir);
    db.prepare(`UPDATE kv_meta SET value = '2' WHERE key = ?`).run(SCHEMA_VERSION_KEY);
    // Drop t3 so re-application is observable; keep t1/t2 as "already applied".
    db.exec(`DROP TABLE t3`);

    const result = runPendingMigrations(db, dir);
    expect(result.startingVersion).toBe(2);
    expect(result.endingVersion).toBe(3);
    expect(result.appliedVersions).toEqual([3]);
    expect(tableExists(db, "t3")).toBe(true);
  });

  it("is an idempotent no-op on a repeated run with nothing pending", () => {
    const db = makeDb();
    const dir = makeCatalog({
      "0001_first": `CREATE TABLE t1 (id INTEGER);`,
    });

    runPendingMigrations(db, dir);
    const second = runPendingMigrations(db, dir);
    expect(second).toEqual({ startingVersion: 1, endingVersion: 1, appliedVersions: [] });
    expect(ledgerValue(db)).toBe("1");
  });

  it("rolls back a failing first migration and leaves version 0", () => {
    const db = makeDb();
    // Creates a table then fails mid-migration.
    const dir = makeCatalog({
      "0001_first": `CREATE TABLE t1 (id INTEGER); INSERT INTO missing_table VALUES (1);`,
    });

    expect(() => runPendingMigrations(db, dir)).toThrow(/migration 0001/);
    // The table created before the failure was rolled back with its version bump.
    expect(tableExists(db, "t1")).toBe(false);
    expect(ledgerValue(db)).toBe("0");
  });

  it("preserves an earlier successful migration when a later one fails", () => {
    const db = makeDb();
    const dir = makeCatalog({
      "0001_first": `CREATE TABLE t1 (id INTEGER); INSERT INTO t1 (id) VALUES (42);`,
      "0002_second": `CREATE TABLE t2 (id INTEGER); INSERT INTO missing_table VALUES (1);`,
    });

    let thrown: unknown;
    try {
      runPendingMigrations(db, dir);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain("migration 0002");
    expect(message).toContain("ledger preserved at 1");

    // Earlier migration intact; failing one fully rolled back.
    expect(tableExists(db, "t1")).toBe(true);
    expect(
      (db.prepare(`SELECT id FROM t1`).get() as { id: number }).id
    ).toBe(42);
    expect(tableExists(db, "t2")).toBe(false);
    // Ledger preserved at the version before the failing migration.
    expect(ledgerValue(db)).toBe("1");
  });

  it("writes RFC-3339 UTC updated_at and changes it when a migration applies", () => {
    const db = makeDb();
    const t1 = new Date("2026-01-02T03:04:05.000Z");
    const t2 = new Date("2026-01-02T03:04:06.000Z");

    const catalogDir = makeCatalog({
      "0001_first": `CREATE TABLE t1 (id INTEGER);`,
      "0002_second": `CREATE TABLE t2 (id INTEGER);`,
    });
    runPendingMigrations(db, catalogDir, () => t1);
    let row = db
      .prepare(`SELECT updated_at FROM kv_meta WHERE key = ?`)
      .get(SCHEMA_VERSION_KEY) as { updated_at: string };
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(row.updated_at).toBe(t1.toISOString());

    // Rewind the ledger to 1 (t2 dropped) and re-apply migration 2 at a later instant.
    db.exec(`DROP TABLE t2`);
    db.prepare(`UPDATE kv_meta SET value = '1' WHERE key = ?`).run(SCHEMA_VERSION_KEY);
    runPendingMigrations(db, catalogDir, () => t2);
    row = db
      .prepare(`SELECT updated_at FROM kv_meta WHERE key = ?`)
      .get(SCHEMA_VERSION_KEY) as { updated_at: string };
    expect(row.updated_at).toBe(t2.toISOString());
  });

  it("fails on invalid canonical ledger values before pending SQL executes", () => {
    for (const bad of ["", "01", "-1", "1.0", "abc"]) {
      const db = makeDb();
      const dir = makeCatalog({
        "0001_first": `CREATE TABLE t1 (id INTEGER);`,
      });
      // Bootstrap then corrupt the ledger value.
      runPendingMigrations(db, dir, () => new Date("2026-01-01T00:00:00.000Z"));
      db.prepare(`UPDATE kv_meta SET value = ? WHERE key = ?`).run(bad, SCHEMA_VERSION_KEY);
      // Reset so the pending migration would be applicable if validation passed.
      db.exec(`DROP TABLE t1`);
      db.prepare(`UPDATE kv_meta SET value = '0' WHERE key = ?`).run(SCHEMA_VERSION_KEY);
      db.prepare(`UPDATE kv_meta SET value = ? WHERE key = ?`).run(bad, SCHEMA_VERSION_KEY);

      expect(() => runPendingMigrations(db, dir)).toThrow(/schema_version/);
      // No pending SQL ran.
      expect(tableExists(db, "t1")).toBe(false);
      expect(ledgerValue(db)).toBe(bad);
    }
  });

  it("fails closed on incompatible stored versions", () => {
    // Stored version exceeds the highest catalog version.
    {
      const db = makeDb();
      const dir = makeCatalog({ "0003_third": `CREATE TABLE t3 (id INTEGER);` });
      runPendingMigrations(db, dir, () => new Date("2026-01-01T00:00:00.000Z")); // apply 3
      db.exec(`DROP TABLE t3`);
      db.prepare(`UPDATE kv_meta SET value = '7' WHERE key = ?`).run(SCHEMA_VERSION_KEY);

      expect(() => runPendingMigrations(db, dir)).toThrow(/exceeds the highest catalog version/);
      expect(ledgerValue(db)).toBe("7");
    }

    // Stored version has no corresponding catalog entry.
    {
      const db = makeDb();
      const dir = makeCatalog({
        "0001_first": `CREATE TABLE t1 (id INTEGER);`,
        "0003_third": `CREATE TABLE t3 (id INTEGER);`,
      });
      runPendingMigrations(db, dir, () => new Date("2026-01-01T00:00:00.000Z"));
      db.exec(`DROP TABLE t1; DROP TABLE t3`);
      db.prepare(`UPDATE kv_meta SET value = '2' WHERE key = ?`).run(SCHEMA_VERSION_KEY);

      expect(() => runPendingMigrations(db, dir)).toThrow(/no corresponding entry/);
      expect(ledgerValue(db)).toBe("2");
    }

    // Nonzero stored version with an empty catalog.
    {
      const db = makeDb();
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-migfail-"));
      tempDirs.push(emptyDir);
      runPendingMigrations(db, emptyDir, () => new Date("2026-01-01T00:00:00.000Z")); // bootstrap 0
      db.prepare(`UPDATE kv_meta SET value = '1' WHERE key = ?`).run(SCHEMA_VERSION_KEY);

      expect(() => runPendingMigrations(db, emptyDir)).toThrow(/catalog is empty/);
      expect(ledgerValue(db)).toBe("1");
    }
  });

  it("does not create kv_meta or change the database when the catalog is invalid", () => {
    const db = makeDb();
    // Orphan up file: catalog discovery must throw before SQLite is touched.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-miginvalid-"));
    tempDirs.push(dir);
    fs.writeFileSync(path.join(dir, "0001_first.up.sql"), `CREATE TABLE t1 (id INTEGER);\n`);

    expect(() => runPendingMigrations(db, dir)).toThrow(/orphan migration file/);
    // No kv_meta table and no other database change.
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
      name: string;
    }[];
    expect(tables).toEqual([]);
  });
});
