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
import { clientRecordSchema } from "../../src/lib/clients/schema";
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

describe("Batch 2B2B — client repository (updates)", () => {
  const tempDirs: string[] = [];
  let db: Database.Database;
  let repo: ClientRepository;
  let clockCounter: number;

  const CLOCKS = [
    new Date("2026-09-17T12:00:00.000Z"),
    new Date("2026-09-17T13:00:00.000Z"),
    new Date("2026-09-17T14:00:00.000Z"),
  ];
  const CLOCKS_ISO = CLOCKS.map((d) => d.toISOString());

  beforeEach(() => {
    clockCounter = 0;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clckd-client-update-"));
    tempDirs.push(dir);
    db = openDatabase({ dbPath: path.join(dir, "test.db") });
    runPendingMigrations(db, MIGRATIONS_DIR, () => FIXED_NOW);
    // ID generation advances only its own counter (decoupled from the clock);
    // the clock advances per now() call: createClient gets CLOCKS[0] for
    // created_at, and the next now() call yields CLOCKS[1] for updateClient.
    // Later calls remain capped at the last CLOCKS entry.
    repo = createClientRepository(db, {
      generateId: () => FIXED_ID_A,
      now: () => CLOCKS[Math.min(clockCounter++, CLOCKS.length - 1)],
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

  const rowOf = (id: string) =>
    db.prepare(`SELECT * FROM client WHERE id = ?`).get(id) as Record<string, unknown>;

  it("updates a single field and returns the stored row", () => {
    const created = repo.createClient({ name: "Original" });

    const updated = repo.updateClient(created.id, { name: "Renamed Studio" });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe("Renamed Studio");
    expect(updated?.id).toBe(created.id);
    expect(rowOf(created.id).name).toBe("Renamed Studio");
  });

  it("updates several fields at once", () => {
    const created = repo.createClient({ name: "Multi" });

    const updated = repo.updateClient(created.id, {
      preferred_contact_name: "Sam",
      city: "Nantes",
      postal_code: "44000",
    });

    expect(updated).toMatchObject({
      preferred_contact_name: "Sam",
      city: "Nantes",
      postal_code: "44000",
    });
    const raw = rowOf(created.id);
    expect(raw.preferred_contact_name).toBe("Sam");
    expect(raw.city).toBe("Nantes");
    expect(raw.postal_code).toBe("44000");
  });

  it("lowercases email and uppercases country on update", () => {
    const created = repo.createClient({ name: "Caseful" });

    const updated = repo.updateClient(created.id, {
      email: "UPPER@EXAMPLE.COM",
      country: "fr",
    });

    expect(updated).toMatchObject({ email: "upper@example.com", country: "FR" });
    const raw = rowOf(created.id);
    expect(raw.email).toBe("upper@example.com");
    expect(raw.country).toBe("FR");
  });

  it("persists null as SQL NULL to clear nullable fields", () => {
    const created = repo.createClient({
      name: "Clearable",
      preferred_contact_name: "Lena",
      email: "lena@example.com",
      phone: "+33612345678",
      address_line1: "12 Rue",
      address_line2: "Apt 4",
      city: "Lyon",
      region: "Auvergne-Rhône-Alpes",
      postal_code: "69002",
      country: "FR",
      notes: "Keep",
    });

    const updated = repo.updateClient(created.id, {
      preferred_contact_name: null,
      email: null,
      phone: null,
      address_line1: null,
      address_line2: null,
      city: null,
      region: null,
      postal_code: null,
      country: null,
      notes: null,
    });

    expect(updated).toMatchObject({
      preferred_contact_name: null,
      email: null,
      phone: null,
      address_line1: null,
      address_line2: null,
      city: null,
      region: null,
      postal_code: null,
      country: null,
      notes: null,
    });

    const raw = rowOf(created.id);
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
    ]) {
      expect(raw[column], column).toBeNull();
    }
  });

  it("leaves omitted fields unchanged", () => {
    const created = repo.createClient({
      name: "Keep",
      email: "keep@example.com",
      phone: "+33612345678",
      city: "Lyon",
    });

    const updated = repo.updateClient(created.id, { notes: "Only this changed" });

    expect(updated).toMatchObject({
      name: "Keep",
      email: "keep@example.com",
      phone: "+33612345678",
      city: "Lyon",
      notes: "Only this changed",
    });
    const raw = rowOf(created.id);
    expect(raw.email).toBe("keep@example.com");
    expect(raw.phone).toBe("+33612345678");
    expect(raw.city).toBe("Lyon");
    expect(raw.notes).toBe("Only this changed");
  });

  it("sets updated_at from the injected clock and preserves created_at", () => {
    const created = repo.createClient({ name: "Timed" });
    expect(created.updated_at).toBe(CLOCKS_ISO[0]);

    const updated = repo.updateClient(created.id, { name: "Timed Again" });

    expect(updated).not.toBeNull();
    expect(updated?.updated_at).toBe(CLOCKS_ISO[1]);
    expect(updated?.created_at).toBe(CLOCKS_ISO[0]);
    const raw = rowOf(created.id);
    expect(raw.updated_at).toBe(CLOCKS_ISO[1]);
    expect(raw.created_at).toBe(CLOCKS_ISO[0]);
  });

  it("preserves id, created_at, and archived_at on update", () => {
    const created = repo.createClient({ name: "Stable" });

    // Archive the row directly (archive methods are out of scope for this batch).
    db.prepare(`UPDATE client SET archived_at = ? WHERE id = ?`).run(CLOCKS_ISO[2], created.id);

    const updated = repo.updateClient(created.id, { name: "Still Stable" });

    expect(updated).not.toBeNull();
    expect(updated?.id).toBe(created.id);
    expect(updated?.created_at).toBe(CLOCKS_ISO[0]);
    expect(updated?.archived_at).toBe(CLOCKS_ISO[2]);
    const raw = rowOf(created.id);
    expect(raw.id).toBe(created.id);
    expect(raw.created_at).toBe(CLOCKS_ISO[0]);
    expect(raw.archived_at).toBe(CLOCKS_ISO[2]);

    const count = db.prepare(`SELECT COUNT(*) AS n FROM client`).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it("returns null when the client does not exist", () => {
    expect(repo.updateClient(FIXED_ID_B, { name: "Ghost" })).toBeNull();

    const count = db.prepare(`SELECT COUNT(*) AS n FROM client`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("rejects an empty update without writing", () => {
    const created = repo.createClient({ name: "Untouched" });

    expect(() => repo.updateClient(created.id, {})).toThrow();
    expect(() => repo.updateClient(created.id, { city: undefined })).toThrow();

    const raw = rowOf(created.id);
    expect(raw.name).toBe("Untouched");
    expect(raw.updated_at).toBe(CLOCKS_ISO[0]);
  });

  it("rejects unknown and server-managed fields without writing", () => {
    const created = repo.createClient({ name: "Protected" });

    expect(() => repo.updateClient(created.id, { unknown_field: "x" })).toThrow();
    expect(() => repo.updateClient(created.id, { id: FIXED_ID_B })).toThrow();
    expect(() => repo.updateClient(created.id, { created_at: "2020-01-01T00:00:00Z" })).toThrow();
    expect(() => repo.updateClient(created.id, { updated_at: "2020-01-01T00:00:00Z" })).toThrow();
    expect(() => repo.updateClient(created.id, { archived_at: "2020-01-01T00:00:00Z" })).toThrow();

    const raw = rowOf(created.id);
    expect(raw.name).toBe("Protected");
    expect(raw.id).toBe(created.id);
    expect(raw.created_at).toBe(CLOCKS_ISO[0]);
    expect(raw.updated_at).toBe(CLOCKS_ISO[0]);
    expect(raw.archived_at).toBeNull();
  });

  it("rejects an invalid ID without writing", () => {
    const created = repo.createClient({ name: "Guarded" });

    expect(() => repo.updateClient("not-a-ulid", { name: "Hijack" })).toThrow();
    expect(() => repo.updateClient(FIXED_ID_B.slice(0, 10), { name: "Hijack" })).toThrow();
    expect(() => repo.updateClient("zzzzzzzzzzzzzzzzzzzzzzzzzz", { name: "Hijack" })).toThrow();

    const raw = rowOf(created.id);
    expect(raw.name).toBe("Guarded");
    expect(raw.updated_at).toBe(CLOCKS_ISO[0]);
  });

  it("returns only validated records", () => {
    const created = repo.createClient({ name: "Validated" });

    const updated = repo.updateClient(created.id, { name: "Validated Again" });

    expect(clientRecordSchema.safeParse(updated).success).toBe(true);
    // The repository never exposes a null record for a successful update.
    expect(updated).not.toBeNull();
    expect(updated?.name).toBe("Validated Again");
  });
});

describe("Batch 2B3A2 — client repository (archive/unarchive)", () => {
  const tempDirs: string[] = [];
  let db: Database.Database;
  let repo: ClientRepository;
  let clockCounter: number;

  const CLOCKS = [
    new Date("2026-09-17T12:00:00.000Z"),
    new Date("2026-09-17T13:00:00.000Z"),
    new Date("2026-09-17T14:00:00.000Z"),
  ];
  const CLOCKS_ISO = CLOCKS.map((d) => d.toISOString());

  /** Injectable clock that throws if called in tests where no clock call is allowed. */
  const throwingClock = () => {
    throw new Error("injected clock must not be called in this test");
  };

  /** Deterministic valid-ULID sequence (Crockford base-32, 26 chars). */
  const makeIdSequence = (prefix: string): (() => string) => {
    let n = 0;
    return () => {
      const c = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[n % 32];
      n += 1;
      return prefix + c;
    };
  };

  beforeEach(() => {
    clockCounter = 0;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clckd-client-archive-"));
    tempDirs.push(dir);
    db = openDatabase({ dbPath: path.join(dir, "test.db") });
    runPendingMigrations(db, MIGRATIONS_DIR, () => FIXED_NOW);
    // A clock that advances per now() call: createClient gets CLOCKS[0],
    // the next now() call yields CLOCKS[1], and so on (capped at CLOCKS[2]).
    repo = createClientRepository(db, {
      generateId: makeIdSequence("01ARZ3NDEKTSV4RRFFQ69G5FA"),
      now: () => CLOCKS[Math.min(clockCounter++, CLOCKS.length - 1)],
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

  const rowOf = (id: string) =>
    db.prepare(`SELECT * FROM client WHERE id = ?`).get(id) as Record<string, unknown>;

  it("archiving an active client sets archived_at and updated_at to the same injected timestamp", () => {
    const created = repo.createClient({ name: "Archive Me" });

    const archived = repo.archiveClient(created.id);

    expect(archived).not.toBeNull();
    expect(archived?.id).toBe(created.id);
    expect(archived?.created_at).toBe(CLOCKS_ISO[0]);
    expect(archived?.archived_at).toBe(CLOCKS_ISO[1]);
    expect(archived?.updated_at).toBe(CLOCKS_ISO[1]);

    // Verify the persisted row, not just the returned record.
    const raw = rowOf(created.id);
    expect(raw.archived_at).toBe(CLOCKS_ISO[1]);
    expect(raw.updated_at).toBe(CLOCKS_ISO[1]);
    expect(raw.id).toBe(created.id);
    expect(raw.created_at).toBe(CLOCKS_ISO[0]);
  });

  it("repeated archive is timestamp-preserving, idempotent, and does not call the clock", () => {
    const created = repo.createClient({ name: "Archived Twice" });
    expect(repo.archiveClient(created.id)?.archived_at).toBe(CLOCKS_ISO[1]);

    // After the two now() calls above (create + archive), the next clock
    // call would yield CLOCKS[2]; a re-archive must not call it at all.
    repo = createClientRepository(db, {
      generateId: () => FIXED_ID_A,
      now: throwingClock,
    });
    const before = rowOf(created.id);

    const again = repo.archiveClient(created.id);

    expect(again).not.toBeNull();
    expect(again?.archived_at).toBe(CLOCKS_ISO[1]);
    expect(again?.updated_at).toBe(CLOCKS_ISO[1]);

    const after = rowOf(created.id);
    expect(after).toEqual(before);
  });

  it("returns null for archiving a missing valid ULID without calling the clock", () => {
    // A throwing clock guarantees no write path (which would require now()) ran.
    repo = createClientRepository(db, {
      generateId: () => FIXED_ID_A,
      now: throwingClock,
    });

    expect(repo.archiveClient(FIXED_ID_B)).toBeNull();

    const count = db.prepare(`SELECT COUNT(*) AS n FROM client`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("unarchiving an archived client clears archived_at and sets updated_at from the injected clock", () => {
    const created = repo.createClient({ name: "Restore Me" });
    repo.archiveClient(created.id);

    // create (CLOCKS[0]) + archive (CLOCKS[1]) happened; unarchive must get CLOCKS[2].
    const unarchived = repo.unarchiveClient(created.id);

    expect(unarchived).not.toBeNull();
    expect(unarchived?.id).toBe(created.id);
    expect(unarchived?.created_at).toBe(CLOCKS_ISO[0]);
    expect(unarchived?.archived_at).toBeNull();
    expect(unarchived?.updated_at).toBe(CLOCKS_ISO[2]);

    const raw = rowOf(created.id);
    expect(raw.archived_at).toBeNull();
    expect(raw.updated_at).toBe(CLOCKS_ISO[2]);
    expect(raw.id).toBe(created.id);
    expect(raw.created_at).toBe(CLOCKS_ISO[0]);
  });

  it("repeated unarchive is timestamp-preserving, idempotent, and does not call the clock", () => {
    const created = repo.createClient({ name: "Active Twice" });
    expect(repo.archiveClient(created.id)?.archived_at).toBe(CLOCKS_ISO[1]);
    expect(repo.unarchiveClient(created.id)?.archived_at).toBeNull();

    // All three clock slots consumed (create/archive/unarchive); a
    // re-unarchive must not call the clock at all.
    repo = createClientRepository(db, {
      generateId: () => FIXED_ID_A,
      now: throwingClock,
    });
    const before = rowOf(created.id);

    const again = repo.unarchiveClient(created.id);

    expect(again).not.toBeNull();
    expect(again?.archived_at).toBeNull();
    expect(again?.updated_at).toBe(CLOCKS_ISO[2]);

    const after = rowOf(created.id);
    expect(after).toEqual(before);
  });

  it("returns null for unarchiving a missing valid ULID without calling the clock", () => {
    repo = createClientRepository(db, {
      generateId: () => FIXED_ID_A,
      now: throwingClock,
    });

    expect(repo.unarchiveClient(FIXED_ID_B)).toBeNull();

    const count = db.prepare(`SELECT COUNT(*) AS n FROM client`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("both methods reject an invalid ULID before writing or calling the clock", () => {
    const created = repo.createClient({ name: "Guarded" });
    const before = rowOf(created.id);
    const invalidIds = ["not-a-ulid", FIXED_ID_B.slice(0, 10), "zzzzzzzzzzzzzzzzzzzzzzzzzz"];

    // A throwing clock proves the invalid ID is rejected before any clock use.
    repo = createClientRepository(db, {
      generateId: () => FIXED_ID_A,
      now: throwingClock,
    });

    for (const invalidId of invalidIds) {
      expect(() => repo.archiveClient(invalidId), invalidId).toThrow();
      expect(() => repo.unarchiveClient(invalidId), invalidId).toThrow();
    }

    expect(rowOf(created.id)).toEqual(before);
  });

  it("archives disappear from the default listing, remain visible with includeArchived, and reappear after unarchive", () => {
    const active = repo.createClient({ name: "Stay Visible" });
    const target = repo.createClient({ name: "Hide Me" });

    expect(repo.listClients().map((c) => c.id).sort()).toEqual([active.id, target.id]);

    repo.archiveClient(target.id);

    expect(repo.listClients().map((c) => c.id)).toEqual([active.id]);
    const withArchived = repo.listClients({ includeArchived: true });
    expect(withArchived.map((c) => c.id).sort()).toEqual([active.id, target.id]);
    expect(withArchived.find((c) => c.id === target.id)?.archived_at).toBe(CLOCKS_ISO[2]);

    repo.unarchiveClient(target.id);

    expect(repo.listClients().map((c) => c.id).sort()).toEqual([active.id, target.id]);
  });

  it("archiveClient and unarchiveClient return records that pass clientRecordSchema", () => {
    const created = repo.createClient({ name: "Schema Check" });

    const archived = repo.archiveClient(created.id);
    expect(archived).not.toBeNull();
    expect(clientRecordSchema.safeParse(archived).success).toBe(true);

    const unarchived = repo.unarchiveClient(created.id);
    expect(unarchived).not.toBeNull();
    expect(clientRecordSchema.safeParse(unarchived).success).toBe(true);
  });
});

describe("Batch 2B3B1 — client repository (archive cascade)", () => {
  const tempDirs: string[] = [];
  let db: Database.Database;
  let repo: ClientRepository;
  let clockCounter: number;

  const CLOCKS = [
    new Date("2026-09-17T12:00:00.000Z"),
    new Date("2026-09-17T13:00:00.000Z"),
    new Date("2026-09-17T14:00:00.000Z"),
  ];
  const CLOCKS_ISO = CLOCKS.map((d) => d.toISOString());

  const rowOf = (table: string, id: string) =>
    db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown>;

  const countOf = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

  /**
   * Seed the full graph under an active client using parameterized SQL only:
   * client -> project(proposed) -> shoot -> shoot_equipment_item,
   * plus task, deliverable, invoice, and quote on the project.
   * All timestamps are bound as parameters (never interpolated).
   */
  const seedGraph = (
    ids: {
      project: string;
      shoot: string;
      equipment: string;
      task: string;
      deliverable: string;
      invoice: string;
    },
    ts: string,
    clientName: string,
  ) => {
    const clientId = repo.createClient({ name: clientName }).id;

    db.prepare(
      `INSERT INTO project (id, client_id, title, status, created_at, updated_at)
       VALUES (?, ?, ?, 'proposed', ?, ?)`,
    ).run(ids.project, clientId, "Graph Project", ts, ts);

    db.prepare(
      `INSERT INTO shoot (id, project_id, shoot_date, location_tz, location, created_at, updated_at)
       VALUES (?, ?, '2026-10-01', 'Europe/Paris', 'Studio A', ?, ?)`,
    ).run(ids.shoot, ids.project, ts, ts);

    db.prepare(
      `INSERT INTO shoot_equipment_item (id, shoot_id, item, created_at, updated_at)
       VALUES (?, ?, 'Camera body', ?, ?)`,
    ).run(ids.equipment, ids.shoot, ts, ts);

    db.prepare(
      `INSERT INTO task (id, project_id, title, created_at, updated_at)
       VALUES (?, ?, 'Graph Task', ?, ?)`,
    ).run(ids.task, ids.project, ts, ts);

    db.prepare(
      `INSERT INTO deliverable (id, project_id, type, title, created_at, updated_at)
       VALUES (?, ?, 'final_master', 'Graph Deliverable', ?, ?)`,
    ).run(ids.deliverable, ids.project, ts, ts);

    db.prepare(
      `INSERT INTO invoice (id, project_id, reference, amount_minor_units, currency, created_at, updated_at)
       VALUES (?, ?, 'INV-GRAPH-001', 120000, 'EUR', ?, ?)`,
    ).run(ids.invoice, ids.project, ts, ts);

    db.prepare(
      `INSERT INTO quote (project_id, amount_minor_units, currency, created_at, updated_at)
       VALUES (?, 95000, 'EUR', ?, ?)`,
    ).run(ids.project, ts, ts);

    return clientId;
  };

  /** Deterministic valid-ULID sequence (Crockford base-32, 26 chars). */
  const makeIdSequence = (prefix: string): (() => string) => {
    let n = 0;
    return () => {
      const c = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[n % 32];
      n += 1;
      return prefix + c;
    };
  };

  const makeRepo = (now: () => Date) =>
    createClientRepository(db, {
      generateId: makeIdSequence("01ARZ3NDEKTSV4RRFFQ69G5FR"),
      now,
    });

  beforeEach(() => {
    clockCounter = 0;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clckd-client-cascade-"));
    tempDirs.push(dir);
    db = openDatabase({ dbPath: path.join(dir, "test.db") });
    runPendingMigrations(db, MIGRATIONS_DIR, () => FIXED_NOW);
    // Clock advances per now() call: createClient gets CLOCKS[0],
    // archiveClient gets CLOCKS[1], unarchiveClient gets CLOCKS[2].
    repo = makeRepo(() => CLOCKS[Math.min(clockCounter++, CLOCKS.length - 1)]);
  });

  afterEach(() => {
    db.close();
  });

  afterAll(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("archiveClient cascades one timestamp to project, shoot, task, deliverable, and invoice while leaving quote and shoot_equipment_item untouched and deleting nothing", () => {
    const ids = {
      project: "01ARZ3NDEKTSV4RRFFQ69G5FP1",
      shoot: "01ARZ3NDEKTSV4RRFFQ69G5FS1",
      equipment: "01ARZ3NDEKTSV4RRFFQ69G5FQ1",
      task: "01ARZ3NDEKTSV4RRFFQ69G5FT1",
      deliverable: "01ARZ3NDEKTSV4RRFFQ69G5FD1",
      invoice: "01ARZ3NDEKTSV4RRFFQ69G5FV1",
    };

    // createClient consumes CLOCKS[0]; archiveClient must consume CLOCKS[1].
    const graphClient = seedGraph(ids, CLOCKS_ISO[0], "Graph Studio");

    // A second, unrelated client and project, created BEFORE the archive call,
    // must remain active and unchanged by the cascade.
    const unrelatedClientRow = {
      id: "01ARZ3NDEKTSV4RRFFQ69G5FY1",
      name: "Unrelated Studio",
      kind: "organization",
      created_at: CLOCKS_ISO[0],
      updated_at: CLOCKS_ISO[0],
    };
    const unrelatedProjectRow = {
      id: "01ARZ3NDEKTSV4RRFFQ69G5FY2",
      client_id: unrelatedClientRow.id,
      title: "Unrelated Project",
      status: "proposed",
      created_at: CLOCKS_ISO[0],
      updated_at: CLOCKS_ISO[0],
    };
    db.prepare(
      `INSERT INTO client (id, name, kind, created_at, updated_at)
       VALUES (?, ?, 'organization', ?, ?)`,
    ).run(unrelatedClientRow.id, unrelatedClientRow.name, unrelatedClientRow.created_at, unrelatedClientRow.updated_at);
    db.prepare(
      `INSERT INTO project (id, client_id, title, status, created_at, updated_at)
       VALUES (?, ?, ?, 'proposed', ?, ?)`,
    ).run(unrelatedProjectRow.id, unrelatedProjectRow.client_id, unrelatedProjectRow.title, unrelatedProjectRow.created_at, unrelatedProjectRow.updated_at);
    const unrelatedBefore = {
      client: rowOf("client", unrelatedClientRow.id),
      project: rowOf("project", unrelatedProjectRow.id),
    };
    const before = {
      project: rowOf("project", ids.project),
      shoot: rowOf("shoot", ids.shoot),
      equipment: rowOf("shoot_equipment_item", ids.equipment),
      task: rowOf("task", ids.task),
      deliverable: rowOf("deliverable", ids.deliverable),
      invoice: rowOf("invoice", ids.invoice),
      quote: db.prepare(`SELECT * FROM quote WHERE project_id = ?`).get(ids.project) as Record<string, unknown>,
    };

    const archived = repo.archiveClient(graphClient);

    expect(archived).not.toBeNull();
    expect(clientRecordSchema.safeParse(archived).success).toBe(true);
    expect(archived?.archived_at).toBe(CLOCKS_ISO[1]);
    expect(archived?.updated_at).toBe(CLOCKS_ISO[1]);
    expect(archived?.id).toBe(graphClient);
    expect(archived?.created_at).toBe(CLOCKS_ISO[0]);
    expect(rowOf("client", graphClient).archived_at).toBe(CLOCKS_ISO[1]);
    expect(rowOf("client", graphClient).updated_at).toBe(CLOCKS_ISO[1]);

    // Every cascaded row receives exactly the same archived_at and updated_at.
    for (const [table, id] of [
      ["project", ids.project],
      ["shoot", ids.shoot],
      ["task", ids.task],
      ["deliverable", ids.deliverable],
      ["invoice", ids.invoice],
    ] as const) {
      const raw = rowOf(table, id);
      expect(raw, table).not.toBeUndefined();
      expect(raw.archived_at, `${table}.archived_at`).toBe(CLOCKS_ISO[1]);
      expect(raw.updated_at, `${table}.updated_at`).toBe(CLOCKS_ISO[1]);
    }

    // quote remains stored with its original updated_at (never cascaded).
    const quoteAfter = db.prepare(`SELECT * FROM quote WHERE project_id = ?`).get(ids.project) as Record<string, unknown>;
    expect(quoteAfter).toEqual(before.quote);
    expect(quoteAfter.updated_at).toBe(CLOCKS_ISO[0]);

    // shoot_equipment_item remains stored with its original updated_at (never cascaded).
    const equipmentAfter = rowOf("shoot_equipment_item", ids.equipment);
    expect(equipmentAfter).toEqual(before.equipment);
    expect(equipmentAfter.updated_at).toBe(CLOCKS_ISO[0]);

    // Nothing was deleted anywhere in the graph.
    expect(countOf("client")).toBe(2);
    expect(countOf("project")).toBe(2);
    expect(countOf("shoot")).toBe(1);
    expect(countOf("shoot_equipment_item")).toBe(1);
    expect(countOf("task")).toBe(1);
    expect(countOf("deliverable")).toBe(1);
    expect(countOf("invoice")).toBe(1);
    expect(countOf("quote")).toBe(1);

    // The unrelated client and project remain active and unchanged.
    expect(rowOf("client", unrelatedClientRow.id)).toEqual(unrelatedBefore.client);
    expect(rowOf("client", unrelatedClientRow.id).archived_at).toBeNull();
    expect(rowOf("project", unrelatedProjectRow.id)).toEqual(unrelatedBefore.project);
    expect(rowOf("project", unrelatedProjectRow.id).archived_at).toBeNull();
  });

  it("unarchiveClient clears only client.archived_at and leaves the whole descendant tree archived", () => {
    const ids = {
      project: "01ARZ3NDEKTSV4RRFFQ69G5FP2",
      shoot: "01ARZ3NDEKTSV4RRFFQ69G5FS2",
      equipment: "01ARZ3NDEKTSV4RRFFQ69G5FQ2",
      task: "01ARZ3NDEKTSV4RRFFQ69G5FT2",
      deliverable: "01ARZ3NDEKTSV4RRFFQ69G5FD2",
      invoice: "01ARZ3NDEKTSV4RRFFQ69G5FV2",
    };

    // createClient consumes CLOCKS[0]; archiveClient consumes CLOCKS[1];
    // unarchiveClient must consume CLOCKS[2].
    const graphClient = seedGraph(ids, CLOCKS_ISO[0], "Restorable Studio");
    repo.archiveClient(graphClient);

    const beforeUnarchive = {
      project: rowOf("project", ids.project),
      shoot: rowOf("shoot", ids.shoot),
      equipment: rowOf("shoot_equipment_item", ids.equipment),
      task: rowOf("task", ids.task),
      deliverable: rowOf("deliverable", ids.deliverable),
      invoice: rowOf("invoice", ids.invoice),
      quote: db.prepare(`SELECT * FROM quote WHERE project_id = ?`).get(ids.project) as Record<string, unknown>,
    };

    const unarchived = repo.unarchiveClient(graphClient);

    expect(unarchived).not.toBeNull();
    expect(clientRecordSchema.safeParse(unarchived).success).toBe(true);
    expect(unarchived?.id).toBe(graphClient);
    expect(unarchived?.created_at).toBe(CLOCKS_ISO[0]);
    expect(unarchived?.archived_at).toBeNull();
    expect(unarchived?.updated_at).toBe(CLOCKS_ISO[2]);
    expect(rowOf("client", graphClient).archived_at).toBeNull();
    expect(rowOf("client", graphClient).updated_at).toBe(CLOCKS_ISO[2]);

    // Descendants remain archived with their ORIGINAL archive timestamp.
    for (const [table, id] of [
      ["project", ids.project],
      ["shoot", ids.shoot],
      ["task", ids.task],
      ["deliverable", ids.deliverable],
      ["invoice", ids.invoice],
    ] as const) {
      const raw = rowOf(table, id);
      expect(raw, table).not.toBeUndefined();
      expect(raw.archived_at, `${table}.archived_at`).toBe(CLOCKS_ISO[1]);
      expect(raw.updated_at, `${table}.updated_at`).toBe(CLOCKS_ISO[1]);
    }

    // quote and shoot_equipment_item remain stored and completely unchanged.
    const quoteAfter = db.prepare(`SELECT * FROM quote WHERE project_id = ?`).get(ids.project) as Record<string, unknown>;
    expect(quoteAfter).toEqual(beforeUnarchive.quote);
    expect(quoteAfter.updated_at).toBe(CLOCKS_ISO[0]);
    const equipmentAfter = rowOf("shoot_equipment_item", ids.equipment);
    expect(equipmentAfter).toEqual(beforeUnarchive.equipment);
    expect(equipmentAfter.updated_at).toBe(CLOCKS_ISO[0]);

    // Nothing was deleted anywhere in the graph.
    expect(countOf("client")).toBe(1);
    expect(countOf("project")).toBe(1);
    expect(countOf("shoot")).toBe(1);
    expect(countOf("shoot_equipment_item")).toBe(1);
    expect(countOf("task")).toBe(1);
    expect(countOf("deliverable")).toBe(1);
    expect(countOf("invoice")).toBe(1);
    expect(countOf("quote")).toBe(1);
  });

  it("rolls back the entire archive cascade when a descendant update fails", () => {
    const ids = {
      project: "01ARZ3NDEKTSV4RRFFQ69G5FP3",
      shoot: "01ARZ3NDEKTSV4RRFFQ69G5FS3",
      equipment: "01ARZ3NDEKTSV4RRFFQ69G5FQ3",
      task: "01ARZ3NDEKTSV4RRFFQ69G5FT3",
      deliverable: "01ARZ3NDEKTSV4RRFFQ69G5FD3",
      invoice: "01ARZ3NDEKTSV4RRFFQ69G5FV3",
    };

    // createClient consumes CLOCKS[0]; archiveClient must consume CLOCKS[1].
    const graphClient = seedGraph(ids, CLOCKS_ISO[0], "Rollback Studio");

    // Complete pre-archive snapshot of every row in the graph.
    const before = {
      client: rowOf("client", graphClient),
      project: rowOf("project", ids.project),
      shoot: rowOf("shoot", ids.shoot),
      equipment: rowOf("shoot_equipment_item", ids.equipment),
      task: rowOf("task", ids.task),
      deliverable: rowOf("deliverable", ids.deliverable),
      invoice: rowOf("invoice", ids.invoice),
      quote: db.prepare(`SELECT * FROM quote WHERE project_id = ?`).get(ids.project) as Record<string, unknown>,
    };

    // Test-only trigger: fail the archive the moment the task row is updated.
    db.exec(
      `CREATE TRIGGER test_fail_task_archive
       BEFORE UPDATE OF archived_at ON task
       BEGIN
         SELECT RAISE(ABORT, 'forced task archive failure');
       END`,
    );

    try {
      expect(() => repo.archiveClient(graphClient)).toThrow("forced task archive failure");

      // Every captured row is exactly equal to its pre-archive value:
      // client, project, and shoot updates already attempted were rolled back.
      expect(rowOf("client", graphClient)).toEqual(before.client);
      expect(rowOf("project", ids.project)).toEqual(before.project);
      expect(rowOf("shoot", ids.shoot)).toEqual(before.shoot);
      expect(rowOf("shoot_equipment_item", ids.equipment)).toEqual(before.equipment);
      expect(rowOf("task", ids.task)).toEqual(before.task);
      expect(rowOf("deliverable", ids.deliverable)).toEqual(before.deliverable);
      expect(rowOf("invoice", ids.invoice)).toEqual(before.invoice);
      const quoteAfter = db.prepare(`SELECT * FROM quote WHERE project_id = ?`).get(ids.project) as Record<string, unknown>;
      expect(quoteAfter).toEqual(before.quote);

      // Explicitly: no row in the graph is archived.
      expect(rowOf("client", graphClient).archived_at).toBeNull();
      expect(rowOf("project", ids.project).archived_at).toBeNull();
      expect(rowOf("shoot", ids.shoot).archived_at).toBeNull();
      expect(rowOf("task", ids.task).archived_at).toBeNull();
      expect(rowOf("deliverable", ids.deliverable).archived_at).toBeNull();
      expect(rowOf("invoice", ids.invoice).archived_at).toBeNull();

      // All eight rows still exist; nothing was deleted.
      expect(countOf("client")).toBe(1);
      expect(countOf("project")).toBe(1);
      expect(countOf("shoot")).toBe(1);
      expect(countOf("shoot_equipment_item")).toBe(1);
      expect(countOf("task")).toBe(1);
      expect(countOf("deliverable")).toBe(1);
      expect(countOf("invoice")).toBe(1);
      expect(countOf("quote")).toBe(1);
    } finally {
      db.exec(`DROP TRIGGER test_fail_task_archive`);
    }
  });
});
