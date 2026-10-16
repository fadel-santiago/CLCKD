import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccessRepository } from "../../src/lib/access/repository";
import { discoverMigrationPairs } from "../../src/lib/db/migrations";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const migrations = path.join(root, "src/lib/db/migrations");
const latest = String(discoverMigrationPairs(migrations).at(-1)!.version);

describe("independent local setup command", () => {
  let directory: string, dbPath: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "clckd-local-setup-"));
    dbPath = path.join(directory, "data/app.db");
    fs.mkdirSync(path.join(directory, "src/lib/db"), { recursive: true });
    fs.cpSync(migrations, path.join(directory, "src/lib/db/migrations"), { recursive: true });
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
  function setup(overrides: Partial<NodeJS.ProcessEnv> = {}) {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development", TSX_DISABLE_CACHE: "1" };
    delete env.CLCKD_DB_PATH;
    delete env.__NEXT_PROCESSED_ENV;
    return spawnSync(process.execPath, ["--import", loader, path.join(root, "scripts/setup-local.ts")], {
      cwd: directory, env: { ...env, ...overrides }, encoding: "utf8", timeout: 15000,
    });
  }
  function inspect(filename = dbPath) {
    const db = new Database(filename, { readonly: true, fileMustExist: true });
    try {
      return { version: db.prepare("SELECT value FROM kv_meta WHERE key = 'schema_version'").get(),
        clients: db.prepare("SELECT count(*) AS total FROM client").get(),
        owners: db.prepare("SELECT count(*) AS total FROM owner_account").get() };
    } finally { db.close(); }
  }
  it("initializes a fresh database and private code without default business data or credentials", () => {
    const result = setup();
    expect(result.status, result.stderr).toBe(0);
    expect(inspect()).toEqual({ version: { value: latest }, clients: { total: 0 }, owners: { total: 0 } });
    const filename = path.join(directory, "data/owner-setup-code");
    expect(fs.readFileSync(filename, "utf8")).toMatch(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/);
    if (process.platform !== "win32") expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
    expect(result.stdout).toContain("Local setup code:");
  });
  it("can be repeated without rotating the initial code", () => {
    expect(setup().status).toBe(0);
    const filename = path.join(directory, "data/owner-setup-code"), code = fs.readFileSync(filename, "utf8");
    expect(setup().status).toBe(0);
    expect(fs.readFileSync(filename, "utf8")).toBe(code);
    expect(inspect().clients).toEqual({ total: 0 });
  });
  it("preserves an existing owner and never prints their setup code", () => {
    expect(setup().status).toBe(0);
    const filename = path.join(directory, "data/owner-setup-code"), code = fs.readFileSync(filename, "utf8");
    const db = new Database(dbPath);
    try {
      createAccessRepository(db).setup({ display_name: "Fictional installation owner", password: "Fictional-installation-passphrase", bootstrap_code: code }, code);
    } finally { db.close(); }
    const result = setup();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Owner already configured");
    expect(result.stdout).not.toContain(code);
    expect(inspect().owners).toEqual({ total: 1 });
  });
  it("loads the optional local environment file like Next.js", () => {
    fs.writeFileSync(path.join(directory, ".env.local"), "CLCKD_DB_PATH=./custom/workspace.db\n");
    const result = setup();
    expect(result.status, result.stderr).toBe(0);
    expect(inspect(path.join(directory, "custom/workspace.db")).version).toEqual({ value: latest });
    expect(fs.existsSync(dbPath)).toBe(false);
    expect(fs.existsSync(path.join(directory, "custom/owner-setup-code"))).toBe(true);
  });
  it("lets an explicit environment variable override the local env file", () => {
    fs.writeFileSync(path.join(directory, ".env.local"), "CLCKD_DB_PATH=./must-not-open.db\n");
    const result = setup({ CLCKD_DB_PATH: dbPath });
    expect(result.status, result.stderr).toBe(0);
    expect(inspect().version).toEqual({ value: latest });
    expect(fs.existsSync(path.join(directory, "must-not-open.db"))).toBe(false);
  });
});
