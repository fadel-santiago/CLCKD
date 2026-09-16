/**
 * Production Batch 1B2A — migration catalog discovery (no execution).
 *
 * Discovers paired SQL migration files in a directory:
 *
 *   000N_name.up.sql / 000N_name.down.sql
 *
 * Rules enforced here (and only here):
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
 * Deliberately out of scope for this batch: migration execution, SQLite access,
 * transactions, and schema-version ledger updates.
 */
import fs from "node:fs";
import path from "node:path";

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

/**
 * Exact paired-filename shape: four digits, underscore,
 * one or more word characters (letters, digits, underscores).
 */
const MIGRATION_FILE_RE = /^(\d{4})_([A-Za-z0-9_]+)\.(up|down)\.sql$/;

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
