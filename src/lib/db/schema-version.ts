import type Database from "better-sqlite3";

export const SCHEMA_VERSION_KEY = "schema_version";
export const INITIAL_SCHEMA_VERSION = "0";

/** RFC-3339 UTC timestamp, e.g. `2026-09-16T18:57:00.000Z`. */
export function rfc3339UtcNow(now: Date = new Date()): string {
  return now.toISOString();
}

/**
 * Idempotent bootstrap of the schema-version ledger (implementation-plan §5.2):
 * creates `kv_meta` if missing and initializes `schema_version` to `"0"` with an
 * RFC-3339 UTC `updated_at`. An existing `schema_version` is preserved on
 * repeated bootstrap.
 */
export function bootstrapSchemaVersion(db: Database.Database, now: Date = new Date()): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS kv_meta (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`
  );

  const existing = db
    .prepare(`SELECT value FROM kv_meta WHERE key = ?`)
    .get(SCHEMA_VERSION_KEY) as { value: string } | undefined;

  if (existing !== undefined) {
    // Ledger already initialized — preserve the existing version and timestamp.
    return;
  }

  db.prepare(
    `INSERT INTO kv_meta (key, value, updated_at) VALUES (?, ?, ?)`
  ).run(SCHEMA_VERSION_KEY, INITIAL_SCHEMA_VERSION, rfc3339UtcNow(now));
}

/** Read the current schema version from the ledger. */
export function readSchemaVersion(db: Database.Database): string {
  const table = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kv_meta'`
    )
    .get() as { name: string } | undefined;
  if (table === undefined) {
    throw new Error(
      `schema_version is unavailable: kv_meta is missing — run bootstrapSchemaVersion first`
    );
  }
  const row = db
    .prepare(`SELECT value FROM kv_meta WHERE key = ?`)
    .get(SCHEMA_VERSION_KEY) as { value: string } | undefined;
  if (row === undefined) {
    throw new Error(
      `kv_meta.${SCHEMA_VERSION_KEY} is missing — run bootstrapSchemaVersion first`
    );
  }
  return row.value;
}
