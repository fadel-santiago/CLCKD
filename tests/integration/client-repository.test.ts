/**
 * Production Batch 2B1A — client repository integration tests (create/get only).
 *
 * Uses an isolated temporary SQLite database with the real migration
 * infrastructure (0001_initial) and injectable ID/clock dependencies.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/lib/db/index";
import { runPendingMigrations } from "../../src/lib/db/migrations";
import {
  createClientRepository,
  type ClientRepository,
} from "../../src/lib/clients/repository";
const MIGRATIONS_DIR = path.join(process.cwd(), "src", "lib", "db", "migrations");

// Deterministic ULID values (valid Crockford base-32, 26 chars).
const FIXED_ID_A = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const FIXED_ID_B = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const FIXED_NOW = new Date("2026-09-17T12:00:00.000Z");
const FIXED_NOW_ISO = FIXED_NOW.toISOString();

describe("Batch 2B1A — client repository (create/get)", () => {
  const tempDirs: string[] = [];
  let db: Database.Database;
  let repo: ClientRepository;
  let idCounter: number;

  const makeRepo = (overrides?: {
    generateId?: () => string;
    now?: () => Date;
  }): ClientRepository =>
    createClientRepository(
      db,
      overrides ?? {
        generateId: () => (idCounter += 1, idCounter === 1 ? FIXED_ID_A : FIXED_ID_B),
        now: () => FIXED_NOW,
      },
    );

  beforeEach(() => {
    idCounter = 0;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clckd-client-repo-"));
    tempDirs.push(dir);
    db = openDatabase({ dbPath: path.join(dir, "test.db") });
    runPendingMigrations(db, MIGRATIONS_DIR, () => FIXED_NOW);
    repo = makeRepo();
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates a client from minimal input and applies defaults", () => {
    const client = repo.createClient({ name: "  Northlight Films  " });

    expect(client.name).toBe("Northlight Films");
    expect(client.kind).toBe("organization");
    expect(client.email).toBeNull();
    expect(client.phone).toBeNull();
    expect(client.notes).toBeNull();
    expect(client.archived_at).toBeNull();
  });

  it("creates a client from a complete input", () => {
    const client = repo.createClient({
      name: "Lena Marsh",
      kind: "person",
      preferred_contact_name: "Lena",
      email: "lena@example.com",
      phone: "+33612345678",
      address_line1: "12 Rue de la Lumière",
      address_line2: "Apt 4",
      city: "Lyon",
      region: "Auvergne-Rhône-Alpes",
      postal_code: "69002",
      country: "fr",
      notes: "Prefers morning shoots.",
    });

    expect(client).toMatchObject({
      name: "Lena Marsh",
      kind: "person",
      preferred_contact_name: "Lena",
      email: "lena@example.com",
      phone: "+33612345678",
      address_line1: "12 Rue de la Lumière",
      address_line2: "Apt 4",
      city: "Lyon",
      region: "Auvergne-Rhône-Alpes",
      postal_code: "69002",
      country: "FR",
      notes: "Prefers morning shoots.",
    });
  });

  it("uses the injected ID and timestamp deterministically", () => {
    const client = repo.createClient({ name: "Deterministic" });

    expect(client.id).toBe(FIXED_ID_A);
    expect(client.created_at).toBe(FIXED_NOW_ISO);
    expect(client.updated_at).toBe(FIXED_NOW_ISO);
  });

  it("lowercases email and uppercases country on save", () => {
    const client = repo.createClient({
      name: "Case Studio",
      email: "Contact@Example.COM",
      country: "de",
    });

    expect(client.email).toBe("contact@example.com");
    expect(client.country).toBe("DE");

    // Verify the stored row, not just the returned value.
    const raw = db
      .prepare(`SELECT email, country FROM client WHERE id = ?`)
      .get(FIXED_ID_A) as { email: string; country: string };
    expect(raw.email).toBe("contact@example.com");
    expect(raw.country).toBe("DE");
  });

  it("stores omitted nullable fields as SQL NULL", () => {
    repo.createClient({ name: "Sparse", kind: "person" });

    const raw = db
      .prepare(
        `SELECT preferred_contact_name, email, phone, address_line1,
                address_line2, city, region, postal_code, country, notes,
                archived_at
         FROM client WHERE id = ?`,
      )
      .get(FIXED_ID_A) as Record<string, unknown>;

    for (const column of [
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
      "archived_at",
    ]) {
      expect(raw[column], column).toBeNull();
    }
  });

  it("returns the stored client by ID", () => {
    const created = repo.createClient({ name: "Fetchable" });

    const fetched = repo.getClientById(created.id);
    expect(fetched).toEqual(created);
  });

  it("returns null for a missing ID", () => {
    const missing = "01J9TESTULID000000000000ZZ";
    expect(repo.getClientById(missing)).toBeNull();
  });

  it("rejects invalid input and writes no row", () => {
    expect(() => repo.createClient({ name: "" })).toThrow();
    expect(() => repo.createClient({ name: "X", email: "not-an-email" })).toThrow();
    expect(() => repo.createClient({ name: "X", id: "hijacked" })).toThrow();
    expect(() => repo.createClient({ name: "X", created_at: "2020-01-01T00:00:00Z" })).toThrow();

    const count = db.prepare(`SELECT COUNT(*) AS n FROM client`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("rejects malformed data read from SQLite", () => {
    repo.createClient({ name: "Corrupted" });

    // Corrupt the stored row into a shape the record schema must reject.
    db.prepare(`UPDATE client SET created_at = 'not-a-timestamp' WHERE id = ?`).run(
      FIXED_ID_A,
    );
    expect(() => repo.getClientById(FIXED_ID_A)).toThrow();

    // A non-ULID id in the stored row must also be rejected.
    db.prepare(`UPDATE client SET id = 'short' WHERE id = ?`).run(FIXED_ID_A);
    // Look up by the (now different) id to exercise validation of the row.
    expect(() => repo.getClientById("short")).toThrow();
  });
});

describe("Batch 2B1B — client repository (listing)", () => {
  const tempDirs: string[] = [];
  let db: Database.Database;
  let repo: ClientRepository;

  /** Deterministic ULID sequence for ordering tests (Crockford base-32, 26 chars). */
  const makeIdSequence = (prefix: string): (() => string) => {
    let n = 0;
    return () => {
      const c = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[n % 32];
      n += 1;
      return prefix + c;
    };
  };

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clckd-client-list-"));
    tempDirs.push(dir);
    db = openDatabase({ dbPath: path.join(dir, "test.db") });
    runPendingMigrations(db, MIGRATIONS_DIR, () => FIXED_NOW);
    repo = createClientRepository(db, {
      generateId: makeIdSequence("01ARZ3NDEKTSV4RRFFQ69G5FA"),
      now: () => FIXED_NOW,
    });
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("by default lists only active clients", () => {
    const active = repo.createClient({ name: "Active Studio" });
    const archived = repo.createClient({ name: "Archived Studio" });

    // Archive one row directly (archive methods are out of scope for this batch).
    db.prepare(`UPDATE client SET archived_at = ? WHERE id = ?`).run(
      FIXED_NOW_ISO,
      archived.id,
    );

    const defaultList = repo.listClients();
    expect(defaultList.map((c) => c.id)).toEqual([active.id]);
    expect(defaultList.every((c) => c.archived_at === null)).toBe(true);

    const all = repo.listClients({ includeArchived: true });
    expect(all.map((c) => c.id)).toEqual([active.id, archived.id]);
    expect(all.find((c) => c.id === archived.id)?.archived_at).toBe(FIXED_NOW_ISO);
  });

  it("includes archived clients when includeArchived is true", () => {
    const first = repo.createClient({ name: "First" });
    const second = repo.createClient({ name: "Second" });

    db.prepare(`UPDATE client SET archived_at = ? WHERE id = ?`).run(
      FIXED_NOW_ISO,
      first.id,
    );
    db.prepare(`UPDATE client SET archived_at = ? WHERE id = ?`).run(
      FIXED_NOW_ISO,
      second.id,
    );

    const all = repo.listClients({ includeArchived: true });
    expect(all.map((c) => c.id).sort()).toEqual([first.id, second.id]);

    // Default still excludes both.
    expect(repo.listClients()).toEqual([]);
  });

  it("orders case-insensitively by name with id as tie-breaker", () => {
    const a = repo.createClient({ name: "alpha" });
    const b = repo.createClient({ name: "Alpha" });
    const c = repo.createClient({ name: "zeta" });
    const d = repo.createClient({ name: "Beta" });

    // Expected: alpha (a), Alpha (b), Beta (d), zeta (c) — name NOCASE, then id.
    expect(repo.listClients().map((c) => c.id)).toEqual([a.id, b.id, d.id, c.id]);

    // includeArchived: true must return the same deterministic order.
    expect(repo.listClients({ includeArchived: true }).map((c) => c.id)).toEqual([
      a.id,
      b.id,
      d.id,
      c.id,
    ]);
  });

  it("rejects malformed rows read from SQLite", () => {
    repo.createClient({ name: "Corrupted Listing" });

    // Corrupt the stored row into a shape the record schema must reject.
    db.prepare(`UPDATE client SET created_at = 'not-a-timestamp'`).run();

    expect(() => repo.listClients()).toThrow();
    expect(() => repo.listClients({ includeArchived: true })).toThrow();
  });
});
