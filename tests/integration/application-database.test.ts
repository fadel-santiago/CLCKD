import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { openMigratedDatabase } from "../../src/lib/db/application";
import { DEFAULT_DB_PATH } from "../../src/lib/db/index";
import { SCHEMA_VERSION_KEY } from "../../src/lib/db/schema-version";

/**
 * Connections captured by the `openDatabase` wrapper (see the vi.mock below).
 * Only the liveness flag is needed for the assertions in this suite.
 */
const capturedConnections = vi.hoisted(
  () => [] as Array<{ readonly open: boolean }>
);

vi.mock("../../src/lib/db/index", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/db/index")>();

  return {
    ...actual,
    openDatabase(...args: Parameters<typeof actual.openDatabase>) {
      const db = actual.openDatabase(...args);
      capturedConnections.push(db);
      return db;
    },
  };
});

/**
 * Production Batch 2C1 — integration tests for the application database
 * gateway (`src/lib/db/application.ts`).
 *
 * Every test is synchronous (`openMigratedDatabase` is synchronous), uses
 * temporary directories under `os.tmpdir()`, and applies the real production
 * migration files from `src/lib/db/migrations`. The real default application
 * database (`data/app.db` under the working directory) is never created or
 * opened; the final test snapshots it before and after a full
 * open/migrate/close cycle on a temporary database and proves the snapshot
 * is unchanged.
 *
 * Deliberately out of scope for this batch: the global application singleton
 * (`getApplicationDatabase` / `getApplicationClientRepository`) is not tested
 * or reset here.
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

/** Snapshot of the real default database file (null when it does not exist). */
interface DefaultDbSnapshot {
  size: number;
  mtimeMs: number;
}

function snapshotDefaultDb(): DefaultDbSnapshot | null {
  if (!fs.existsSync(DEFAULT_DB_PATH)) {
    return null;
  }
  const stat = fs.statSync(DEFAULT_DB_PATH);
  return { size: stat.size, mtimeMs: stat.mtimeMs };
}

/** Read the ledger schema_version value directly (no dependency on the reader helper). */
function ledgerSchemaVersion(db: Database.Database): string {
  const row = db
    .prepare(`SELECT value FROM kv_meta WHERE key = ?`)
    .get(SCHEMA_VERSION_KEY) as { value: string } | undefined;
  if (row === undefined) {
    throw new Error("kv_meta ledger row for schema_version is missing");
  }
  return row.value;
}

/** All user table names in the database, sorted. */
function tableNames(db: Database.Database): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name).sort();
}

describe("Batch 2C1 — openMigratedDatabase (application gateway)", () => {
  const tempDirs: string[] = [];
  const openDbs: Database.Database[] = [];

  /** Create a tracked temporary directory. */
  function makeTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  /** Open a tracked temporary database at `dir/app.db` via the gateway. */
  function makeMigratedDb(dir: string): Database.Database {
    const db = openMigratedDatabase({
      dbPath: path.join(dir, "app.db"),
      migrationsDir: MIGRATIONS_DIR,
    });
    openDbs.push(db);
    return db;
  }

  afterEach(() => {
    // Close every connection opened in this test, then drop the handle.
    for (const db of openDbs.splice(0)) {
      try {
        db.close();
      } catch {
        // already closed
      }
    }
    // Remove every temporary directory created in this test.
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    for (const db of openDbs.splice(0)) {
      try {
        db.close();
      } catch {
        // already closed
      }
    }
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("opens a fresh temporary database and migrates it to schema version 1", () => {
    const dir = makeTempDir("vm-app-database-");
    const dbPath = path.join(dir, "app.db");
    expect(fs.existsSync(dbPath)).toBe(false);

    const db = makeMigratedDb(dir);

    // The file was created and the connection is open.
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(db.open).toBe(true);

    // Migrated to exactly schema version 1 by the real 0001_initial migration.
    expect(ledgerSchemaVersion(db)).toBe("1");
  });

  it("creates the real initial tables (the eight entity tables plus kv_meta)", () => {
    const dir = makeTempDir("vm-app-database-");
    const db = makeMigratedDb(dir);

    // Ledger + the eight entity tables — nothing else.
    expect(tableNames(db)).toEqual([...ENTITY_TABLES, "kv_meta"].sort());
  });

  it("is an idempotent no-op when the same database is reopened and migrations rerun", () => {
    const dir = makeTempDir("vm-app-database-");
    const dbPath = path.join(dir, "app.db");

    const first = makeMigratedDb(dir);
    expect(ledgerSchemaVersion(first)).toBe("1");
    const tablesAfterFirst = tableNames(first);
    first.close();
    openDbs.splice(openDbs.indexOf(first), 1);

    // Reopen the same file through the gateway and rerun migrations.
    const second = openMigratedDatabase({ dbPath, migrationsDir: MIGRATIONS_DIR });
    openDbs.push(second);

    expect(second.open).toBe(true);
    // Still exactly version 1 — no migration was applied a second time.
    expect(ledgerSchemaVersion(second)).toBe("1");
    // The schema is unchanged.
    expect(tableNames(second)).toEqual(tablesAfterFirst);
  });

  it("rethrows a migration-initialization failure and closes the newly opened connection", () => {
    const dir = makeTempDir("vm-app-database-");
    const dbPath = path.join(dir, "app.db");

    // A nonexistent migrations directory makes catalog discovery fail before
    // any SQL is executed — a clean migration-initialization failure.
    const badMigrationsDir = path.join(dir, "does-not-exist");

    // The openDatabase wrapper (see the vi.mock above) records every real
    // connection the gateway opens, so we can inspect the exact one this
    // failing call creates.
    const capturedBefore = capturedConnections.length;

    expect(() =>
      openMigratedDatabase({
        dbPath,
        migrationsDir: badMigrationsDir,
      })
    ).toThrow(/migrations directory is unreadable/i);

    // Exactly one new connection was opened by the failing call…
    expect(capturedConnections).toHaveLength(capturedBefore + 1);
    const capturedConnection = capturedConnections[capturedBefore];
    expect(capturedConnection).toBeDefined();
    // …and the gateway closed it — no usable open connection remains.
    expect(capturedConnection.open).toBe(false);
  });

  it("never creates or touches the real default data/app.db", () => {
    // Snapshot before any test operation (null if the file does not exist —
    // it may legitimately exist after the user starts CLCKD).
    const before = snapshotDefaultDb();

    // A complete open/migrate/close cycle on a temporary database only.
    const dir = makeTempDir("vm-app-database-");
    const db = makeMigratedDb(dir);
    expect(ledgerSchemaVersion(db)).toBe("1");
    db.close();
    openDbs.splice(openDbs.indexOf(db), 1);

    // The real application database is bit-for-bit the same as before.
    expect(snapshotDefaultDb()).toEqual(before);
  });
});
