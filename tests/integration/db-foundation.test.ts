import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/lib/db/index";
import {
  bootstrapSchemaVersion,
  readSchemaVersion,
  SCHEMA_VERSION_KEY,
} from "../../src/lib/db/schema-version";

const RFC3339_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

describe("Batch 1B1 — SQLite connection and schema ledger", () => {
  const tempDirs: string[] = [];
  let db: Database.Database;

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-test-db-"));
    tempDirs.push(dir);
    // A nested subdirectory proves the DB layer (not the test) creates parents.
    db = openDatabase({ dbPath: path.join(dir, "nested", "test.db") });
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("applies the required PRAGMAs on every connection", () => {
    const pragma = (name: string): unknown => {
      const row = db.prepare(`PRAGMA ${name}`).get() as Record<string, unknown>;
      return Object.values(row)[0];
    };
    expect(String(pragma("journal_mode")).toLowerCase()).toBe("wal");
    expect(Number(pragma("foreign_keys"))).toBe(1);
    expect(Number(pragma("busy_timeout"))).toBe(5000);
    expect(Number(pragma("synchronous"))).toBe(1); // 0 = OFF, 1 = NORMAL, 2 = FULL, 3 = EXTRA
    expect(Number(pragma("temp_store"))).toBe(1); // 1 = FILE (0 = MEMORY)
  });

  it("creates the database parent directory through the DB layer", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-test-db-"));
    tempDirs.push(dir);
    const target = path.join(dir, "a", "b", "c", "app.db");
    expect(fs.existsSync(path.dirname(target))).toBe(false);
    const conn = openDatabase({ dbPath: target });
    expect(fs.existsSync(path.dirname(target))).toBe(true);
    conn.close();
  });

  it("bootstraps kv_meta with schema_version '0' and an RFC-3339 UTC updated_at", () => {
    bootstrapSchemaVersion(db);

    const row = db
      .prepare(
        `SELECT value, updated_at FROM kv_meta WHERE key = ?`
      )
      .get(SCHEMA_VERSION_KEY) as { value: string; updated_at: string };

    expect(row.value).toBe("0");
    expect(row.updated_at).toMatch(RFC3339_UTC);
    // toISOString() always ends in Z — assert explicit UTC form.
    expect(row.updated_at.endsWith("Z")).toBe(true);
  });

  it("matches the required kv_meta column contract", () => {
    bootstrapSchemaVersion(db);
    const info = db.prepare(`PRAGMA table_info(kv_meta)`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    expect(info.map((c) => c.name)).toEqual(["key", "value", "updated_at"]);
    expect(info[0]).toMatchObject({ type: "TEXT", pk: 1 });
    expect(info[1]).toMatchObject({ type: "TEXT", notnull: 1 });
    expect(info[2]).toMatchObject({ type: "TEXT", notnull: 1 });
  });

  it("is idempotent on repeated bootstrap (no duplicate rows)", () => {
    bootstrapSchemaVersion(db);
    bootstrapSchemaVersion(db);
    bootstrapSchemaVersion(db);
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM kv_meta`)
      .get() as { n: number };
    expect(count.n).toBe(1);
  });

  it("preserves an existing schema_version on repeated bootstrap", () => {
    bootstrapSchemaVersion(db);
    db.prepare(
      `UPDATE kv_meta SET value = '7', updated_at = '2099-01-01T00:00:00.000Z' WHERE key = ?`
    ).run(SCHEMA_VERSION_KEY);

    bootstrapSchemaVersion(db);

    expect(readSchemaVersion(db)).toBe("7");
    const row = db
      .prepare(`SELECT updated_at FROM kv_meta WHERE key = ?`)
      .get(SCHEMA_VERSION_KEY) as { updated_at: string };
    expect(row.updated_at).toBe("2099-01-01T00:00:00.000Z");
  });

  it("throws a clear error when reading the version before bootstrap", () => {
    expect(() => readSchemaVersion(db)).toThrow(
      /schema_version.*(missing|bootstrap)/i
    );
  });
});
