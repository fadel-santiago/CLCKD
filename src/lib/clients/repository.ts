/**
 * Production Batch 2B1A/2B3 — client repository (CRUD-lite + archive).
 *
 * - The database connection is injected (no global connection is created here).
 * - ID generation and the clock are injectable for deterministic tests.
 * - Every value read from SQLite is validated through `clientRecordSchema`
 *   before being returned; raw rows never escape this module.
 * - All SQL is parameterized.
 *
 * Deliberately out of scope (later batches): hard deletion, routes,
 * server actions, UI.
 */
import type Database from "better-sqlite3";
import { ulid } from "ulid";
import {
  clientRecordSchema,
  createClientSchema,
  updateClientSchema,
  type Client,
} from "./schema";

/** Injectable dependencies for deterministic behavior in tests. */
export interface ClientRepositoryDependencies {
  /** ULID generator. Defaults to the `ulid` package. */
  generateId?: () => string;
  /** Current instant (RFC-3339 UTC when formatted). Defaults to `new Date()`. */
  now?: () => Date;
}

/** Client repository bound to a single injected database connection. */
export interface ClientRepository {
  /** Validate input, persist a new client, and return the validated stored row. */
  createClient(input: unknown): Client;
  /** Return the validated client with this ID, or null when no row exists. */
  getClientById(id: string): Client | null;
  /**
   * List clients. Archived rows (archived_at IS NOT NULL) are excluded by
   * default; `includeArchived: true` returns active and archived clients.
   * Ordered deterministically: name (case-insensitive) ascending, id ascending.
   */
  listClients(options?: { includeArchived?: boolean }): Client[];
  /**
   * Validate the ID and input, update only the supplied fields, and return
   * the validated stored row. Returns null when no client with this ID
   * exists. Supplied `null` values clear the column; omitted fields are
   * left unchanged.
   */
  updateClient(id: string, input: unknown): Client | null;
  /**
   * Validate the ID, archive the client (setting `archived_at` and
   * `updated_at` to one injected-clock timestamp), and cascade that same
   * timestamp to the client's project, shoot, task, deliverable, and
   * invoice rows — all inside one transaction. Returns the validated
   * stored row. Returns null when no client with this ID exists. Re-archiving
   * an already-archived client is idempotent and preserves the original
   * timestamps.
   */
  archiveClient(id: string): Client | null;
  /**
   * Validate the ID, unarchive the client (clearing only `client.archived_at`
   * and bumping `client.updated_at`), and return the validated stored row.
   * Descendant rows are left untouched. Returns null when no client with
   * this ID exists. Unarchiving an already-active client is idempotent and
   * preserves the original timestamps.
   */
  unarchiveClient(id: string): Client | null;
}

/** ULID (Crockford base-32, 26 chars) — same rule as `clientRecordSchema`. */
const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * Descendant tables whose `archived_at`/`updated_at` cascade when a client
 * is archived (fixed list — never derived from user input).
 */
const ARCHIVE_CASCADE_TABLES = ["project", "shoot", "task", "deliverable", "invoice"] as const;

/** Columns of `client` that are user-writable (docs/data-model.md §1.1). */
const WRITABLE_COLUMNS = [
  "name",
  "kind",
  "preferred_contact_name",
  "email",
  "phone",
  "address_line1",
  "address_line2",
  "city",
  "region",
  "postal_code",
  "country",
  "notes",
] as const;

/** Read one row and validate it as a full client record (or null if missing). */
function readValidatedClient(db: Database.Database, id: string): Client | null {
  const row = db
    .prepare(`SELECT * FROM client WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (row === undefined) {
    return null;
  }
  return clientRecordSchema.parse(row);
}

/** Read all rows matching the filter and validate each as a client record. */
function listValidatedClients(db: Database.Database, includeArchived: boolean): Client[] {
  const rows = db
    .prepare(
      includeArchived
        ? `SELECT * FROM client
           ORDER BY name COLLATE NOCASE ASC, id ASC`
        : `SELECT * FROM client WHERE archived_at IS NULL
           ORDER BY name COLLATE NOCASE ASC, id ASC`,
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => clientRecordSchema.parse(row));
}

/**
 * Build a client repository over an already-open database connection.
 *
 * The caller owns opening and closing `db`; this factory neither opens nor
 * closes the connection and never creates a global database.
 */
export function createClientRepository(
  db: Database.Database,
  dependencies: ClientRepositoryDependencies = {},
): ClientRepository {
  const generateId = dependencies.generateId ?? (() => ulid());
  const now = dependencies.now ?? (() => new Date());

  return {
    createClient(input: unknown): Client {
      const data = createClientSchema.parse(input);

      // Normalize on save (docs/data-model.md §1.1).
      const email = data.email !== undefined ? data.email.toLowerCase() : null;
      const country = data.country !== undefined ? data.country.toUpperCase() : null;

      const id = generateId();
      const timestamp = now().toISOString();

      const values: Record<(typeof WRITABLE_COLUMNS)[number], unknown> = {
        name: data.name,
        kind: data.kind ?? "organization",
        preferred_contact_name: data.preferred_contact_name ?? null,
        email,
        phone: data.phone ?? null,
        address_line1: data.address_line1 ?? null,
        address_line2: data.address_line2 ?? null,
        city: data.city ?? null,
        region: data.region ?? null,
        postal_code: data.postal_code ?? null,
        country,
        notes: data.notes ?? null,
      };

      const allColumns: Array<keyof typeof values> = [...WRITABLE_COLUMNS];
      const columnList = allColumns.join(", ");
      const placeholders = allColumns.map(() => "?").join(", ");
      const params = [
        id,
        timestamp,
        timestamp,
        null, // archived_at — new clients are active
        ...allColumns.map((column) => values[column]),
      ];

      db.prepare(
        `INSERT INTO client (
           id, created_at, updated_at, archived_at, ${columnList}
         ) VALUES (
           ?, ?, ?, ?, ${placeholders}
         )`,
      ).run(...params);

      // Validate the stored row before returning it.
      const stored = readValidatedClient(db, id);
      if (stored === null) {
        throw new Error(`client insert failed: row ${id} was not persisted`);
      }
      return stored;
    },

    getClientById(id: string): Client | null {
      return readValidatedClient(db, id);
    },

    listClients(options?: { includeArchived?: boolean }): Client[] {
      return listValidatedClients(db, options?.includeArchived ?? false);
    },

    updateClient(id: string, input: unknown): Client | null {
      // Validate the ID before touching SQLite (no write can follow a throw).
      if (typeof id !== "string" || !ulidRegex.test(id)) {
        throw new Error("id must be a valid ULID");
      }

      // Validate input; throws on unknown/server-managed fields, invalid
      // values, or an empty update (no write can follow a throw).
      const data = updateClientSchema.parse(input);

      // Only fields actually supplied (value !== undefined) are updated;
      // a supplied null clears the column. Column names come exclusively
      // from the fixed allowlist; every value is bound as a SQL parameter.
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let emailParamIndex = -1;
      let countryParamIndex = -1;

      for (const column of WRITABLE_COLUMNS) {
        const value = data[column];
        if (value === undefined) {
          continue;
        }
        setClauses.push(`${column} = ?`);
        params.push(value);
        if (column === "email") {
          emailParamIndex = params.length - 1;
        }
        if (column === "country") {
          countryParamIndex = params.length - 1;
        }
      }

      // Normalize on save (docs/data-model.md §1.1): lowercase a non-null
      // email, uppercase a non-null country; nulls pass through unchanged.
      if (emailParamIndex !== -1 && typeof data.email === "string") {
        params[emailParamIndex] = data.email.toLowerCase();
      }
      if (countryParamIndex !== -1 && typeof data.country === "string") {
        params[countryParamIndex] = data.country.toUpperCase();
      }

      // Server-managed: updated_at from the injected clock. id, created_at,
      // and archived_at are never touched by this method.
      setClauses.push(`updated_at = ?`);
      params.push(now().toISOString());

      params.push(id);

      const result = db
        .prepare(
          `UPDATE client SET ${setClauses.join(", ")} WHERE id = ?`,
        )
        .run(...params);

      if (result.changes === 0) {
        return null;
      }

      // Validate the stored row before returning it.
      const stored = readValidatedClient(db, id);
      if (stored === null) {
        throw new Error(`client update failed: row ${id} is no longer readable`);
      }
      return stored;
    },

    archiveClient(id: string): Client | null {
      // Validate the ID before touching SQLite (no write can follow a throw).
      if (typeof id !== "string" || !ulidRegex.test(id)) {
        throw new Error("id must be a valid ULID");
      }

      const runArchive = db.transaction(() => {
        const existingRow = db
          .prepare(`SELECT * FROM client WHERE id = ?`)
          .get(id) as Record<string, unknown> | undefined;
        if (existingRow === undefined) {
          return null;
        }

        // Already archived: idempotent, preserve the original timestamps.
        if (existingRow.archived_at !== null) {
          return clientRecordSchema.parse(existingRow);
        }

        // One injected-clock timestamp for archived_at and updated_at.
        const timestamp = now().toISOString();

        // Archive the client.
        db.prepare(`UPDATE client SET archived_at = ?, updated_at = ? WHERE id = ?`)
          .run(timestamp, timestamp, id);

        // Cascade the same timestamp to the client's projects.
        db.prepare(
          `UPDATE project SET archived_at = ?, updated_at = ? WHERE client_id = ?`,
        ).run(timestamp, timestamp, id);

        // Cascade it to the remaining descendants through their projects.
        for (const table of ARCHIVE_CASCADE_TABLES) {
          if (table === "project") {
            continue;
          }
          db.prepare(
            `UPDATE ${table}
             SET archived_at = ?, updated_at = ?
             WHERE project_id IN (SELECT id FROM project WHERE client_id = ?)`,
          ).run(timestamp, timestamp, id);
        }

        // Validate the stored row before returning it.
        const stored = readValidatedClient(db, id);
        if (stored === null) {
          throw new Error(`client archive failed: row ${id} is no longer readable`);
        }
        return stored;
      });

      return runArchive();
    },

    unarchiveClient(id: string): Client | null {
      // Validate the ID before touching SQLite (no write can follow a throw).
      if (typeof id !== "string" || !ulidRegex.test(id)) {
        throw new Error("id must be a valid ULID");
      }

      const runUnarchive = db.transaction(() => {
        const existingRow = db
          .prepare(`SELECT * FROM client WHERE id = ?`)
          .get(id) as Record<string, unknown> | undefined;
        if (existingRow === undefined) {
          return null;
        }

        // Already active: idempotent, preserve the original timestamps.
        if (existingRow.archived_at === null) {
          return clientRecordSchema.parse(existingRow);
        }

        // One injected-clock timestamp for updated_at (archived_at -> NULL).
        const timestamp = now().toISOString();

        // Clear only the client's archived_at; descendants are left untouched.
        db.prepare(`UPDATE client SET archived_at = NULL, updated_at = ? WHERE id = ?`)
          .run(timestamp, id);

        // Validate the stored row before returning it.
        const stored = readValidatedClient(db, id);
        if (stored === null) {
          throw new Error(`client unarchive failed: row ${id} is no longer readable`);
        }
        return stored;
      });

      return runUnarchive();
    },
  };
}
