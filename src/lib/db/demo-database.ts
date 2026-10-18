import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { discoverMigrationPairs } from "./migrations";
import { readSchemaVersion } from "./schema-version";

// Shared with the fictional fixture generator; not a production setting.
export const DEMO_APPLICATION_ID = 0x434c444d;
export const DEMO_FIXTURE_DIGEST_KEY = "demo_fixture_sha256";

/** Detect edits to seeded business records without including credentials or sessions. */
export function demoFixtureDigest(db: Database.Database): string {
  const hash = createHash("sha256");
  const privateTables = new Set(["owner_account", "access_session", "access_attempt", "access_invitation", "invitation_output"]);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  for (const { name } of tables) {
    if (privateTables.has(name)) continue;
    const quoted = '"' + name.replaceAll('"', '""') + '"';
    const rows = name === "kv_meta"
      ? db.prepare(`SELECT * FROM ${quoted} WHERE key != ?`).all(DEMO_FIXTURE_DIGEST_KEY)
      : db.prepare(`SELECT * FROM ${quoted}`).all();
    hash.update(JSON.stringify([name, rows.map(row => JSON.stringify(row)).sort()]));
  }
  return hash.digest("hex");
}

/** An edited/legacy fixture is never silently approved for anonymous publication. */
export function assertAnonymousDemoDatabase(db: Database.Database): void {
  if (!db.readonly || db.pragma("query_only", { simple: true }) !== 1) throw new Error("Anonymous demo access requires a read-only connection.");
  const row = db.prepare("SELECT value FROM kv_meta WHERE key = ?").get(DEMO_FIXTURE_DIGEST_KEY) as { value: string } | undefined;
  if (!row || !/^[a-f0-9]{64}$/.test(row.value) || row.value !== demoFixtureDigest(db)) {
    throw new Error("Anonymous access requires an unchanged freshly seeded fictional demo. Existing records have not been exposed or reset.");
  }
}

export function demoDatabasePath(value: string | undefined, cwd = process.cwd()): string {
  const root = fs.realpathSync(cwd);
  const target = path.join(root, "data/demo/clckd-demo.db");
  const requested = value ? path.resolve(cwd, value) : null;
  if (!requested || (requested !== target && requested !== path.resolve(cwd, "data/demo/clckd-demo.db"))) {
    throw new Error("Set CLCKD_DB_PATH explicitly to this checkout's data/demo/clckd-demo.db. Other database paths are refused.");
  }
  for (const directory of [path.join(root, "data"), path.dirname(target)]) {
    let stat: fs.Stats;
    try { stat = fs.lstatSync(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Demo directories must not be symlinks or files.");
  }
  for (const filename of [target, target + "-wal", target + "-shm", target + "-journal", path.join(path.dirname(target), "owner-setup-code")]) {
    let stat: fs.Stats;
    try { stat = fs.lstatSync(filename); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw new Error("Demo files must be regular files, not symlinks or hard links.");
  }
  return target;
}

/** Never creates a database, runs migrations, seeds records or issues sessions. */
export function openReadOnlyDemoDatabase(value: string | undefined, cwd = process.cwd()): Database.Database {
  const filename = demoDatabasePath(value, cwd);
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    db.pragma("query_only = ON");
    db.pragma("foreign_keys = ON");
    if (db.pragma("application_id", { simple: true }) !== DEMO_APPLICATION_ID) {
      throw new Error("Read-only mode requires the marked fictional demo database.");
    }
    const catalog = discoverMigrationPairs(path.join(cwd, "src/lib/db/migrations"));
    const latest = catalog.at(-1)?.version;
    if (latest === undefined || readSchemaVersion(db) !== String(latest)) {
      throw new Error("Prepare the demo schema before enabling read-only mode.");
    }
    const clients = db.prepare("SELECT name, email FROM client ORDER BY name").all();
    const expected = [
      { name: "Fieldwork Coffee", email: "hello@example.com" },
      { name: "Lumina Studio", email: "projects@example.com" },
      { name: "Northstar Creative Studio", email: "studio@example.com" },
    ];
    const projects = db.prepare("SELECT title FROM project ORDER BY title").all();
    if (JSON.stringify(clients) !== JSON.stringify(expected) || JSON.stringify(projects) !== JSON.stringify([
      { title: "Autumn Brand Campaign" }, { title: "Coffee, People & Place" }, { title: "Product Launch Film" },
    ])) throw new Error("Read-only mode requires the isolated fictional fixture, without additional clients or projects.");
    if (db.pragma("quick_check", { simple: true }) !== "ok" || (db.pragma("foreign_key_check") as unknown[]).length) {
      throw new Error("The demo database failed integrity checks.");
    }
    return db;
  } catch (error) { db.close(); throw error; }
}
