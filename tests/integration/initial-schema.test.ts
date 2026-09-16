import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/lib/db/index";
import { discoverMigrationPairs, runPendingMigrations } from "../../src/lib/db/migrations";
import { readSchemaVersion, rfc3339UtcNow, SCHEMA_VERSION_KEY } from "../../src/lib/db/schema-version";

/**
 * Production Batch 1C3A — smoke tests for the real 0001_initial migration.
 *
 * Unlike the synthetic catalogs in `migration-runner.test.ts`, these tests run
 * the actual production SQL files in `src/lib/db/migrations` against fresh
 * temporary databases, and verify the exact resulting schema (tables, explicit
 * indexes, triggers) plus a full down/up round trip.
 */

/** Absolute path to the real production migrations directory (test-location anchored). */
const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
  "lib",
  "db",
  "migrations"
);

/** The eight entity tables created by the initial migration (kv_meta is ledger-owned). */
const ENTITY_TABLES: string[] = [
  "client",
  "deliverable",
  "invoice",
  "project",
  "quote",
  "shoot",
  "shoot_equipment_item",
  "task",
];

/** Explicitly created indexes (SQLite-owned `sqlite_autoindex_*` are excluded). */
const EXPECTED_INDEXES: string[] = [
  "idx_client_name_country_nocase",
  "ux_invoice_project_reference",
  "ux_shoot_equipment_item_shoot_item_sort",
];

/** Explicitly created triggers. */
const EXPECTED_TRIGGERS: string[] = [
  "trg_project_client_active_insert",
  "trg_project_client_active_update",
  "trg_project_quote_status_update",
  "trg_quote_project_non_lead_insert",
  "trg_quote_project_non_lead_update",
];

/** All user-visible tables after a clean migration: the ledger plus the eight entities. */
const EXPECTED_TABLES: string[] = [...ENTITY_TABLES, "kv_meta"].sort();

function tableNames(db: Database.Database): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name).sort();
}

/** Explicitly created indexes — SQLite-owned autoindexes (`sqlite_*`) are ignored. */
function explicitIndexNames(db: Database.Database): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name).sort();
}

function triggerNames(db: Database.Database): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger'`)
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name).sort();
}

describe("Batch 1C3A — real 0001_initial migration smoke tests", () => {
  const tempDirs: string[] = [];
  const openDbs: Database.Database[] = [];

  /** Open a fresh temporary database through the project DB helper, tracked for cleanup. */
  function makeDb(): Database.Database {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vm-initial-"));
    tempDirs.push(dir);
    const db = openDatabase({ dbPath: path.join(dir, "app.db") });
    openDbs.push(db);
    return db;
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

  it("applies the real initial migration to a fresh database with the expected schema", () => {
    const db = makeDb();

    // Discover the real production catalog and confirm 0001 is present first.
    const catalog = discoverMigrationPairs(MIGRATIONS_DIR);
    expect(catalog.length).toBeGreaterThanOrEqual(1);
    const initialPair = catalog[0];
    if (initialPair === undefined) {
      throw new Error("migration 0001_initial is missing from the production catalog");
    }
    expect(initialPair.version).toBe(1);
    expect(initialPair.name).toBe("initial");

    // Run the existing pending-migration runner against the real files.
    const result = runPendingMigrations(db, MIGRATIONS_DIR);
    expect(result.startingVersion).toBe(0);
    expect(result.endingVersion).toBe(1);
    expect(result.appliedVersions).toEqual([1]);

    // Ledger: schema_version is exactly "1".
    expect(readSchemaVersion(db)).toBe("1");

    // Exact application table set (ledger + eight entities; no others).
    expect(tableNames(db)).toEqual(EXPECTED_TABLES);
    for (const table of ENTITY_TABLES) {
      const row = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(table);
      expect(row).not.toBeUndefined();
    }

    // Exactly the three explicitly created indexes (autoindexes ignored).
    expect(explicitIndexNames(db)).toEqual(EXPECTED_INDEXES);

    // Exactly the five triggers.
    expect(triggerNames(db)).toEqual(EXPECTED_TRIGGERS);
  });

  it("rolls back via the real down SQL and re-applies cleanly through the runner", () => {
    const db = makeDb();

    // First apply migration 0001 normally.
    runPendingMigrations(db, MIGRATIONS_DIR);
    expect(readSchemaVersion(db)).toBe("1");

    // Locate the real down file via catalog discovery (no duplicated SQL).
    const pair = discoverMigrationPairs(MIGRATIONS_DIR).find((p) => p.version === 1);
    if (pair === undefined) {
      throw new Error("migration 0001_initial is missing from the production catalog");
    }
    expect(pair.name).toBe("initial");
    const downSql = fs.readFileSync(pair.downPath, "utf8");
    expect(downSql.length).toBeGreaterThan(0);

    // Down SQL + ledger rewind to "0" in one transaction, using the same
    // validated ledger update convention as runPendingMigrations.
    db.transaction(() => {
      db.exec(downSql);
      db.prepare(`UPDATE kv_meta SET value = ?, updated_at = ? WHERE key = ?`).run(
        "0",
        rfc3339UtcNow(),
        SCHEMA_VERSION_KEY
      );
    })();

    // Rollback leaves exactly the ledger table and version "0".
    expect(tableNames(db)).toEqual(["kv_meta"]);
    expect(readSchemaVersion(db)).toBe("0");

    // Re-run the normal pending-migration runner: all eight entity tables return.
    const result = runPendingMigrations(db, MIGRATIONS_DIR);
    expect(result.startingVersion).toBe(0);
    expect(result.endingVersion).toBe(1);
    expect(result.appliedVersions).toEqual([1]);

    for (const table of ENTITY_TABLES) {
      const row = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(table);
      expect(row).not.toBeUndefined();
    }
    expect(readSchemaVersion(db)).toBe("1");
  });
});
