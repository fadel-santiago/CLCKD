/**
 * Production Batch 2C1 — application database gateway.
 *
 * Server-side entry point for the CLCKD database used by future pages and
 * server actions. This module:
 *
 * - exposes `openMigratedDatabase` — open a database at an explicit path and
 *   run the pending migrations on it; on migration failure the newly opened
 *   connection is closed before the original error is rethrown, so no SQLite
 *   connection is left open by an initialization failure. Connections created
 *   here are never cached — the caller owns their lifetime.
 * - exposes `getApplicationDatabase` — the lazily opened, migrated,
 *   application-wide connection, cached on `globalThis` so Next.js
 *   development reloads reuse it. No database is opened at module import.
 * - exposes `getApplicationClientRepository` — the client repository bound to
 *   the application database, reusing `createClientRepository` unchanged.
 *
 * Deliberately out of scope: closing/resetting the application-wide
 * connection (no such operation is exposed), custom repository bindings.
 */
import path from "node:path";
import type Database from "better-sqlite3";
import { openDatabase } from "./index";
import { runPendingMigrations } from "./migrations";
import { isReadOnlyDemo } from "../access/demo-mode";
import { demoDatabasePath, openReadOnlyDemoDatabase } from "./demo-database";
import { createClientRepository, type ClientRepository } from "../clients/repository";
import {
  createOperationsRepository,
  type OperationsRepository,
} from "../operations/repository";
import { createProductionRepository, type ProductionRepository } from "../production/repository";

/** Default location of the migration SQL files (relative to the working directory). */
export const DEFAULT_MIGRATIONS_DIR = path.join(
  process.cwd(),
  "src",
  "lib",
  "db",
  "migrations"
);

/** Options for {@link openMigratedDatabase}. */
export interface OpenMigratedDatabaseOptions {
  /**
   * Absolute path to the SQLite file. Defaults to the application database
   * location (`data/app.db` under the working directory) from the DB layer.
   */
  dbPath?: string;
  /**
   * Directory that directly contains the migration files. Defaults to
   * `src/lib/db/migrations` under the working directory.
   */
  migrationsDir?: string;
  /** Clock for migration ledger timestamps (defaults to `new Date()`). */
  now?: () => Date;
}

/**
 * Open a database and run all pending migrations on it.
 *
 * The database is opened through the existing DB layer (PRAGMAs included),
 * then `runPendingMigrations` is executed before the connection is returned.
 * If migration initialization throws, the newly opened connection is closed
 * first and the original error is rethrown — the caller never receives a
 * connection, and none is left open.
 *
 * Connections created here are never cached; the caller owns the connection
 * and is responsible for closing it.
 *
 * @returns The open, migrated better-sqlite3 connection.
 * @throws The original migration-initialization error (connection already closed).
 */
export function openMigratedDatabase(
  options: OpenMigratedDatabaseOptions = {}
): Database.Database {
  const migrationsDir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;
  const db = openDatabase({ dbPath: options.dbPath });
  try {
    runPendingMigrations(db, migrationsDir, options.now);
  } catch (err) {
    try {
      db.close();
    } catch {
      // The connection may already be unusable (e.g. closed by the engine);
      // the original initialization error is the one that must surface.
    }
    throw err;
  }
  return db;
}

/**
 * GlobalThis slot holding the application-wide connection across Next.js
 * development module reloads. Only ever read/written by this module via
 * {@link getApplicationDatabase}; there is intentionally no close/reset API.
 */
const GLOBAL_CACHE_KEY = "__clckdApplicationDatabase";

function globalCache(): { [GLOBAL_CACHE_KEY]?: Database.Database } {
  return globalThis as unknown as { [GLOBAL_CACHE_KEY]?: Database.Database };
}

/**
 * Return the application-wide database connection, opening and migrating it
 * on first use.
 *
 * - No SQLite connection is opened during module import; the first call
 *   lazily opens the default application database and migrates it.
 * - The connection is cached on `globalThis`, so repeated calls (including
 *   after Next.js development reloads) return the same open connection.
 * - If the cached connection has been closed, a fresh one is created and
 *   cached in its place.
 * - No operation to close the application-wide connection is exposed.
 */
export function getApplicationDatabase(): Database.Database {
  const readOnly = isReadOnlyDemo();
  // Validate before considering the cache: a previously writable connection
  // must never bypass a newly enabled restriction or an unsafe path.
  const demoPath = readOnly ? demoDatabasePath(process.env.CLCKD_DB_PATH) : undefined;
  const cached = globalCache()[GLOBAL_CACHE_KEY];
  if (cached !== undefined && cached.readonly === readOnly && (!readOnly || cached.name === demoPath)) {
    try {
      // A closed connection throws on use — that is the liveness probe.
      cached.prepare(`SELECT 1`).get();
      return cached;
    } catch {
      // Closed (or otherwise unusable): replace it below.
    }
  }

  const db = readOnly
    ? openReadOnlyDemoDatabase(process.env.CLCKD_DB_PATH)
    : openMigratedDatabase({ dbPath: process.env.CLCKD_DB_PATH });
  globalCache()[GLOBAL_CACHE_KEY] = db;
  return db;
}

/**
 * Return the client repository bound to the application database.
 *
 * Reuses the existing `createClientRepository` implementation verbatim — no
 * repository behavior is duplicated here.
 */
export function getApplicationClientRepository(): ClientRepository {
  return createClientRepository(getApplicationDatabase());
}

/** Return the production-workflow repository bound to the application database. */
export function getApplicationOperationsRepository(): OperationsRepository {
  return createOperationsRepository(getApplicationDatabase());
}

/** Apply newly added migrations to a live development connection before use. */
export function getApplicationProductionRepository(): ProductionRepository {
  const db = getApplicationDatabase();
  if (!db.readonly) runPendingMigrations(db, DEFAULT_MIGRATIONS_DIR);
  return createProductionRepository(db);
}
