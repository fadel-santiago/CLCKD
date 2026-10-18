import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { assertMutationsAllowed } from "../access/demo-mode";

/**
 * Application database location (git-ignored `data/` directory).
 * Only this module may create the parent directory — no other code in the
 * application touches `data/` via direct filesystem access.
 */
export const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "app.db");

/** PRAGMAs applied on every connection (implementation-plan §5.1). */
const REQUIRED_PRAGMAS: ReadonlyArray<{ name: string; value: string | number }> = [
  { name: "journal_mode", value: "WAL" },
  { name: "foreign_keys", value: "ON" },
  { name: "busy_timeout", value: 5000 },
  { name: "synchronous", value: "NORMAL" },
  { name: "temp_store", value: "FILE" },
];

/**
 * Apply the fixed §5.1 PRAGMA set to a connection. Exported so tests (and
 * future callers) can verify the exact settings on any open database.
 */
export function applyPragmas(db: Database.Database): void {
  for (const pragma of REQUIRED_PRAGMAS) {
    db.pragma(`${pragma.name} = ${String(pragma.value)}`);
  }
}

/** Options for {@link openDatabase}. */
export interface OpenDatabaseOptions {
  /**
   * Absolute path to the SQLite file. Defaults to `data/app.db` under the
   * working directory. Tests must pass a temporary path and never the real
   * application database.
   */
  dbPath?: string;
}

/**
 * Open (creating if necessary) a SQLite database with all §5.1 PRAGMAs set.
 *
 * The parent directory is created here and nowhere else: this is the single
 * sanctioned place that touches the filesystem for the persistence target.
 */
export function openDatabase(options: OpenDatabaseOptions = {}): Database.Database {
  assertMutationsAllowed();
  const dbPath = options.dbPath ?? DEFAULT_DB_PATH;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  applyPragmas(db);
  return db;
}
