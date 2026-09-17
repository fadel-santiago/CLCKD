/**
 * Production Batch 2B1A — client repository (create and read only).
 *
 * - The database connection is injected (no global connection is created here).
 * - ID generation and the clock are injectable for deterministic tests.
 * - Every value read from SQLite is validated through `clientRecordSchema`
 *   before being returned; raw rows never escape this module.
 * - All SQL is parameterized.
 *
 * Deliberately out of scope (later batches): listing, updates, archive/
 * unarchive, hard deletion, routes, server actions, UI.
 */
import type Database from "better-sqlite3";
import { ulid } from "ulid";
import {
  clientRecordSchema,
  createClientSchema,
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
}

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
  };
}
