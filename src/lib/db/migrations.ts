/**
 * Production Batch 1B2A/1B2B — migration catalog discovery and transactional
 * forward migration execution.
 *
 * Discovers paired SQL migration files in a directory:
 *
 *   000N_name.up.sql / 000N_name.down.sql
 *
 * Catalog rules enforced by `discoverMigrationPairs`:
 * - exact four-digit numeric version prefix, `0001` … `9999`;
 *   version `0000` is rejected — schema version 0 is the unmigrated ledger baseline;
 * - every up file must have a matching down file with the same version AND name,
 *   and vice versa (orphan files are rejected);
 * - a given numeric version may appear exactly once (duplicates are rejected,
 *   including differently named pairs sharing a version);
 * - any `.up.sql` / `.down.sql` file whose stem does not match the exact
 *   `NNNN_name` shape is malformed and rejected;
 * - unrelated ordinary files in the directory are ignored.
 *
 * `runPendingMigrations` additionally:
 * - validates the entire catalog before touching SQLite (fail closed);
 * - bootstraps the `kv_meta` ledger only after catalog validation succeeds;
 * - reads and validates `schema_version` as a canonical non-negative integer;
 * - fails closed when the stored version exceeds the highest catalog version,
 *   names a version missing from the catalog, or is nonzero with an empty catalog;
 * - applies each pending migration (up SQL + schema-version bump) inside one
 *   better-sqlite3 transaction, in ascending version order;
 * - on failure rolls back that single migration, preserves earlier ones,
 *   and rethrows an error identifying the failing migration;
 * - never opens or closes the supplied database connection.
 *
 * Deliberately out of scope: down/rollback execution, CLI scripts, backups.
 */
import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { bootstrapSchemaVersion, rfc3339UtcNow, SCHEMA_VERSION_KEY } from "./schema-version";

/** A discovered, validated up/down migration pair. */
export interface MigrationPair {
  /**
   * Numeric version parsed from the four-digit prefix (1–9999).
   * Version 0 is invalid — it is the unmigrated ledger baseline.
   */
  version: number;
  /** Human-readable name shared by the up and down files (e.g. `initial`). */
  name: string;
  /** Absolute path to the `NNNN_name.up.sql` file. */
  upPath: string;
  /** Absolute path to the `NNNN_name.down.sql` file. */
  downPath: string;
}

/** Parsed form of a single migration filename (before pairing). */
interface MigrationFile {
  version: number;
  name: string;
  direction: "up" | "down";
  filePath: string;
}

/** Result of one `runPendingMigrations` call. */
export interface MigrationRunResult {
  /** Ledger schema_version before any migration was applied. */
  startingVersion: number;
  /** Ledger schema_version after the run (highest applied version, or start if none). */
  endingVersion: number;
  /** Versions applied during this call, in ascending order. Empty for a no-op. */
  appliedVersions: number[];
}

/**
 * Exact paired-filename shape: four digits, underscore,
 * one or more word characters (letters, digits, underscores).
 */
const MIGRATION_FILE_RE = /^(\d{4})_([A-Za-z0-9_]+)\.(up|down)\.sql$/;

/** Canonical ledger value: a non-negative integer with no leading zero ("0", "1", …). */
const CANONICAL_VERSION_RE = /^(0|[1-9]\d*)$/;

/** Parse one filename into a MigrationFile, or null if it is not a migration file. */
function parseMigrationFilename(fileName: string): MigrationFile | null {
  const match = MIGRATION_FILE_RE.exec(fileName);
  if (match === null) {
    return null;
  }
  return {
    version: Number(match[1]),
    name: match[2],
    direction: match[3] as "up" | "down",
    filePath: "",
  };
}

/**
 * Discover the ordered migration catalog in `migrationsDir`.
 *
 * @param migrationsDir Directory that directly contains the migration files.
 * @returns Pairs sorted by ascending numeric version (0001 first).
 * @throws Error if the directory is missing/unreadable, a malformed
 *   `.up.sql`/`.down.sql` filename is found, a version has an orphan up or
 *   down file, a numeric version is declared more than once, the up and
 *   down files of a pair disagree on name, or version `0000` is used.
 */
export function discoverMigrationPairs(migrationsDir: string): MigrationPair[] {
  // Resolve to an absolute path up front so returned upPath/downPath are always
  // absolute, even when the caller supplies a relative directory.
  const dir = path.resolve(migrationsDir);

  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    throw new Error(
      `migrations directory is unreadable: ${dir} (${(err as NodeJS.ErrnoException).message ?? err})`
    );
  }

  const files: MigrationFile[] = [];
  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    if (!fs.statSync(filePath).isFile()) {
      continue; // unrelated subdirectories are ignored
    }

    const parsed = parseMigrationFilename(entry);
    if (parsed !== null) {
      parsed.filePath = filePath;
      files.push(parsed);
      continue;
    }

    // A file that ends in a migration suffix but does not match the exact
    // NNNN_name shape is malformed — never silently ignored.
    if (entry.endsWith(".up.sql") || entry.endsWith(".down.sql")) {
      throw new Error(
        `malformed migration filename: ${entry} — expected NNNN_name.up.sql / NNNN_name.down.sql`
      );
    }
    // Any other ordinary file is unrelated and ignored.
  }

  const byVersion = new Map<number, { up?: MigrationFile; down?: MigrationFile }>();
  for (const file of files) {
    // Version 0 is the unmigrated ledger baseline — no migration may occupy it.
    if (file.version === 0) {
      throw new Error(
        `invalid migration version 0000: ${path.basename(file.filePath)} — ` +
          `version 0 is the unmigrated ledger baseline; valid versions are 0001–9999`
      );
    }

    let slot = byVersion.get(file.version);
    if (slot === undefined) {
      slot = {};
      byVersion.set(file.version, slot);
    }
    if (slot[file.direction] !== undefined) {
      throw new Error(
        `duplicate migration for version ${String(file.version).padStart(4, "0")}: ` +
          `${path.basename(slot[file.direction]!.filePath)} and ${path.basename(file.filePath)}`
      );
    }
    slot[file.direction] = file;
  }

  const pairs: MigrationPair[] = [];
  for (const [version, slot] of byVersion) {
    if (slot.up === undefined || slot.down === undefined) {
      const missing = slot.up === undefined ? "down" : "up";
      const present = path.basename((slot.up ?? slot.down)!.filePath);
      throw new Error(
        `orphan migration file: ${present} — missing matching ${missing} file for version ${String(version).padStart(4, "0")}`
      );
    }

    // A pair is valid only when up and down share both the numeric version
    // and the migration name.
    if (slot.up.name !== slot.down.name) {
      throw new Error(
        `migration name mismatch for version ${String(version).padStart(4, "0")}: ` +
          `${path.basename(slot.up.filePath)} and ${path.basename(slot.down.filePath)} ` +
          `— up and down files must share the same migration name`
      );
    }

    pairs.push({
      version,
      name: slot.up.name,
      upPath: slot.up.filePath,
      downPath: slot.down.filePath,
    });
  }

  // Numeric ordering by the four-digit version (the map may hold any order).
  pairs.sort((a, b) => a.version - b.version);
  return pairs;
}

/** Read the ledger schema_version and validate it as a canonical non-negative integer. */
function readCanonicalSchemaVersion(db: Database.Database): number {
  const raw = db
    .prepare(`SELECT value FROM kv_meta WHERE key = ?`)
    .get(SCHEMA_VERSION_KEY) as { value: string } | undefined;
  if (raw === undefined || typeof raw.value !== "string" || !CANONICAL_VERSION_RE.test(raw.value)) {
    throw new Error(
      `invalid schema_version in kv_meta: ${JSON.stringify(raw?.value)} — expected a canonical non-negative integer (e.g. "0", "1", "23")`
    );
  }
  return Number(raw.value);
}

/**
 * Apply all pending migrations to `db` in ascending version order.
 *
 * The catalog is discovered and fully validated before SQLite is touched; the
 * `kv_meta` ledger is bootstrapped only after that validation succeeds.
 * Each migration's up SQL and its schema-version bump run inside a single
 * better-sqlite3 transaction, so a failure rolls back exactly that migration
 * while earlier ones remain applied. The supplied connection is neither
 * opened nor closed by this function.
 *
 * @param db An already-open better-sqlite3 database connection.
 * @param migrationsDir Directory that directly contains the migration files.
 * @param now Optional clock for `updated_at` timestamps (defaults to `new Date()`).
 * @returns startingVersion, endingVersion, and the versions applied this run.
 * @throws Error if the catalog is invalid, the stored schema_version is
 *   non-canonical, exceeds the highest catalog version, or names a version
 *   missing from the catalog; or if a migration's up SQL fails (rethrown with
 *   the failing migration identified).
 */
export function runPendingMigrations(
  db: Database.Database,
  migrationsDir: string,
  now?: () => Date
): MigrationRunResult {
  // 1. Discover and completely validate the catalog before touching SQLite.
  const catalog = discoverMigrationPairs(migrationsDir);

  // 2. Bootstrap the ledger only after catalog validation succeeded.
  bootstrapSchemaVersion(db, now ? now() : new Date());

  // 3. Read and validate the stored schema_version.
  const startingVersion = readCanonicalSchemaVersion(db);

  // 4. Fail closed on an incompatible stored version. An empty catalog is a
  // valid no-op only at the unmigrated baseline (version 0).
  if (catalog.length === 0 && startingVersion !== 0) {
    throw new Error(
      `incompatible schema_version ${startingVersion}: the migration catalog is empty — refusing to run`
    );
  }
  const highest = catalog.length > 0 ? catalog[catalog.length - 1].version : 0;
  if (startingVersion > highest) {
    throw new Error(
      `incompatible schema_version ${startingVersion}: exceeds the highest catalog version ${String(highest).padStart(4, "0")} — refusing to run`
    );
  }
  if (startingVersion !== 0 && !catalog.some((pair) => pair.version === startingVersion)) {
    throw new Error(
      `incompatible schema_version ${startingVersion}: no corresponding entry in the migration catalog — refusing to run`
    );
  }

  // 5. Apply only pending migrations, ascending. `currentVersion` tracks the
  // ledger as each migration commits, so a failure reports exactly where the
  // run stopped and earlier successful migrations remain in place.
  const appliedVersions: number[] = [];
  let currentVersion = startingVersion;
  for (const pair of catalog) {
    if (pair.version <= startingVersion) {
      continue;
    }

    // Read the up SQL inside the per-migration error boundary so a
    // filesystem/read failure also identifies the failing migration.
    try {
      const upSql = fs.readFileSync(pair.upPath, "utf8");
      const updatedAt = rfc3339UtcNow(now ? now() : new Date());

      // Up SQL + ledger bump in one transaction; on failure only this
      // migration's schema changes and its version bump roll back.
      db.transaction(() => {
        db.exec(upSql);
        db.prepare(`UPDATE kv_meta SET value = ?, updated_at = ? WHERE key = ?`).run(
          String(pair.version),
          updatedAt,
          SCHEMA_VERSION_KEY
        );
      })();

      currentVersion = pair.version;
      appliedVersions.push(pair.version);
    } catch (err) {
      const detail = err instanceof Error ? `: ${err.message}` : ` (${String(err)})`;
      const paddedVersion = String(pair.version).padStart(4, "0");
      throw new Error(
        `migration ${paddedVersion} failed — version ${pair.version} ("${pair.name}") rolled back; ` +
          `ledger preserved at ${currentVersion}${detail}`
      );
    }
  }

  // Report the run.
  return { startingVersion, endingVersion: currentVersion, appliedVersions };
}
