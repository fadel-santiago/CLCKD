import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoDatabasePath, openDemoDatabase, seedDemoWorkspace } from "../../scripts/demo-workspace";
import { openReadOnlyDemoDatabase } from "../../src/lib/db/demo-database";
import { getApplicationDatabase, openMigratedDatabase } from "../../src/lib/db/application";
import { createOperationsRepository } from "../../src/lib/operations/repository";
import { createProductionRepository } from "../../src/lib/production/repository";
import { assertMutationsAllowed, isReadOnlyDemo } from "../../src/lib/access/demo-mode";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
type Cache = { __clckdApplicationDatabase?: Database.Database };
const cache = globalThis as Cache;

describe("fail-closed read-only demo database", () => {
  let directory: string;
  let target: string;
  const connections: Database.Database[] = [];
  beforeEach(() => {
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "0");
    directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "clckd-readonly-test-")));
    target = path.join(directory, "data/demo/clckd-demo.db");
    fs.mkdirSync(path.join(directory, "src/lib/db"), { recursive: true });
    fs.cpSync(path.join(root, "src/lib/db/migrations"), path.join(directory, "src/lib/db/migrations"), { recursive: true });
  });
  afterEach(() => {
    if (cache.__clckdApplicationDatabase?.open) cache.__clckdApplicationDatabase.close();
    delete cache.__clckdApplicationDatabase;
    for (const db of connections.splice(0)) if (db.open) db.close();
    vi.restoreAllMocks(); vi.unstubAllEnvs();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  function prepare() {
    const db = openDemoDatabase(target, directory);
    connections.push(db);
    seedDemoWorkspace(db);
    db.close();
  }
  it.each([undefined, "data/app.db", ":memory:", "other.db"])("refuses unsafe or implicit database %s without creating files", value => {
    expect(() => openReadOnlyDemoDatabase(value, directory)).toThrow("explicitly");
    expect(fs.existsSync(path.join(directory, "data"))).toBe(false);
  });
  it("refuses a missing database without creating it", () => {
    expect(() => openReadOnlyDemoDatabase(target, directory)).toThrow();
    expect(fs.existsSync(target)).toBe(false);
  });
  it("refuses unmarked, unseeded and outdated databases without changing them", () => {
    const db = openDemoDatabase(target, directory); connections.push(db);
    expect(() => openReadOnlyDemoDatabase(target, directory)).toThrow("fictional fixture");
    seedDemoWorkspace(db);
    db.pragma("application_id = 0");
    expect(() => openReadOnlyDemoDatabase(target, directory)).toThrow("marked fictional");
    db.pragma("application_id = 1129071693"); // CLDM
    db.prepare("UPDATE kv_meta SET value = '0' WHERE key = 'schema_version'").run();
    const snapshot = db.serialize();
    expect(() => openReadOnlyDemoDatabase(target, directory)).toThrow("schema");
    expect(db.serialize()).toEqual(snapshot);
  });
  it("refuses extra client records even in a marked fixture", () => {
    prepare();
    const db = new Database(target); connections.push(db);
    db.prepare("UPDATE client SET email = 'changed@example.com' WHERE name = 'Fieldwork Coffee'").run();
    expect(() => openReadOnlyDemoDatabase(target, directory)).toThrow("fictional fixture");
  });
  it("rejects symlinks and hard links before opening a database", () => {
    prepare();
    const linked = target + ".original"; fs.renameSync(target, linked);
    fs.symlinkSync(linked, target);
    expect(() => openReadOnlyDemoDatabase(target, directory)).toThrow("symlinks");
    fs.unlinkSync(target); fs.linkSync(linked, target);
    expect(() => demoDatabasePath(target, directory)).toThrow("hard links");
  });
  it("reads the dashboard and every production workspace without changing the snapshot; rejects SQL writes", () => {
    prepare();
    const db = openReadOnlyDemoDatabase(target, directory); connections.push(db);
    expect(db.readonly).toBe(true);
    const snapshot = db.serialize();
    const operations = createOperationsRepository(db);
    expect(operations.getDashboard()).toBeDefined();
    const production = createProductionRepository(db);
    for (const project of operations.listProjects()) expect(production.getWorkspace(project.id)).not.toBeNull();
    for (const sql of ["UPDATE client SET name = 'changed'", "DELETE FROM project", "INSERT INTO kv_meta VALUES ('forbidden', '1', 'now')", "CREATE TABLE forbidden (id TEXT)"]) {
      expect(() => db.exec(sql)).toThrow(/readonly/i);
    }
    expect(db.serialize()).toEqual(snapshot);
  });
  it("never reuses a writable cached connection when demo mode is enabled", () => {
    prepare();
    const writable = new Database(target); connections.push(writable);
    cache.__clckdApplicationDatabase = writable;
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    vi.stubEnv("CLCKD_DB_PATH", target); vi.stubEnv("CLCKD_READ_ONLY_DEMO", "1");
    expect(getApplicationDatabase().readonly).toBe(true);
    vi.stubEnv("CLCKD_DB_PATH", path.join(directory, "data/app.db"));
    expect(() => getApplicationDatabase()).toThrow("explicitly");
    expect(() => openMigratedDatabase({ dbPath: target })).toThrow("read-only");
  });
  it("preserves writable normal mode and rejects mistyped opt-in values", () => {
    expect(isReadOnlyDemo()).toBe(false);
    expect(() => assertMutationsAllowed()).not.toThrow();
    const db = openMigratedDatabase({ dbPath: path.join(directory, "normal.db") }); connections.push(db);
    expect(db.readonly).toBe(false);
    db.prepare("UPDATE kv_meta SET value = value").run();
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "true");
    expect(() => getApplicationDatabase()).toThrow("0 or 1");
    expect(() => assertMutationsAllowed()).toThrow("0 or 1");
  });
});
