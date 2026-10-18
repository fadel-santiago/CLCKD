import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { demoDatabasePath, openDemoDatabase, seedDemoWorkspace } from "../../scripts/demo-workspace";
import { createProductionRepository } from "../../src/lib/production/repository";
import { createOperationsRepository } from "../../src/lib/operations/repository";
import { createAccessRepository } from "../../src/lib/access/repository";
import { readLocalSetupCode } from "../../src/lib/access/setup-code";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const now = new Date("2026-10-16T10:00:00.000Z");

describe("guarded reusable fictional demo", () => {
  let directory: string, target: string, db: Database.Database | undefined;
  beforeEach(() => {
    directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "clckd-demo-test-")));
    target = path.join(directory, "data/demo/clckd-demo.db");
    fs.mkdirSync(path.join(directory, "src/lib/db"), { recursive: true });
    fs.cpSync(path.join(root, "src/lib/db/migrations"), path.join(directory, "src/lib/db/migrations"), { recursive: true });
  });
  afterEach(() => { if (db?.open) db.close(); db = undefined; fs.rmSync(directory, { recursive: true, force: true }); });
  function cli(action: string, dbPath?: string) {
    const env: NodeJS.ProcessEnv = { ...process.env, TSX_DISABLE_CACHE: "1" }; delete env.CLCKD_DB_PATH;
    return spawnSync(process.execPath, ["--import", loader, path.join(root, "scripts/demo.ts"), action], { cwd: directory, env: { ...env, ...(dbPath ? { CLCKD_DB_PATH: dbPath } : {}) }, encoding: "utf8", timeout: 15000 });
  }
  it.each([undefined, "data/app.db", ":memory:", "other.db", "data/demo/../app.db"])("refuses unsafe or implicit target %s without touching default data", (value) => {
    fs.mkdirSync(path.join(directory, "data"));
    const live = path.join(directory, "data/app.db"); fs.writeFileSync(live, "synthetic safety sentinel");
    expect(() => demoDatabasePath(value, directory)).toThrow("explicitly");
    expect(fs.readFileSync(live, "utf8")).toBe("synthetic safety sentinel");
    expect(fs.existsSync(target)).toBe(false);
  });
  it("does not accept an env-file default as explicit demo authorization", () => {
    fs.writeFileSync(path.join(directory, ".env.local"), "CLCKD_DB_PATH=./data/demo/clckd-demo.db\n");
    const result = cli("seed"); expect(result.status).toBe(1); expect(result.stderr).toContain("explicitly");
    expect(fs.existsSync(target)).toBe(false);
  });
  it("rejects symlinked directories, sidecars and hard-linked database files", () => {
    fs.mkdirSync(path.join(directory, "private")); fs.mkdirSync(path.join(directory, "data"));
    fs.symlinkSync(path.join(directory, "private"), path.join(directory, "data/demo"));
    expect(() => demoDatabasePath(target, directory)).toThrow("symlinks");
    fs.unlinkSync(path.join(directory, "data/demo")); fs.mkdirSync(path.join(directory, "data/demo"));
    fs.writeFileSync(path.join(directory, "private/synthetic.db"), "sentinel");
    fs.symlinkSync(path.join(directory, "private/synthetic.db"), target + "-wal");
    expect(() => demoDatabasePath(target, directory)).toThrow("symlinks");
    fs.unlinkSync(target + "-wal"); fs.linkSync(path.join(directory, "private/synthetic.db"), target);
    expect(() => demoDatabasePath(target, directory)).toThrow("hard links");
  });
  it("refuses existing unmarked records without writing or migrating them", () => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    db = new Database(target); db.exec("CREATE TABLE client (name TEXT); INSERT INTO client VALUES ('Fictional pre-existing sentinel')"); db.close();
    const before = fs.readFileSync(target);
    expect(() => openDemoDatabase(target, directory)).toThrow("existing records");
    expect(fs.readFileSync(target)).toEqual(before);
  });
  it("seeds the requested legitimate project states, exact payments and consistent relationships", () => {
    db = openDemoDatabase(target, directory); expect(seedDemoWorkspace(db, now)).toBe(true);
    const production = createProductionRepository(db); const operations = createOperationsRepository(db, { now: () => now });
    const projects = operations.listProjects(); expect(projects).toHaveLength(3);
    const main = production.getWorkspace(projects.find(p => p.title === "Autumn Brand Campaign")!.id)!;
    expect(main.project.status).toBe("post_production"); expect(main.shoots).toHaveLength(2); expect(main.tasks).toHaveLength(8);
    expect(main.tasks.filter(t => t.status === "done")).toHaveLength(6);
    expect(main.tasks.find(t => t.title === "Process client feedback")?.status).toBe("in_progress");
    expect(main.tasks.find(t => t.title === "Finish approved masters")?.status).toBe("todo");
    const brand = main.outputs.find(o => o.title === "Brand Film")!;
    expect(brand.current.review_status).toBe("approved"); expect(brand.current.delivered_at).not.toBeNull();
    const social = main.outputs.find(o => o.title === "Social Media Edits")!;
    expect(social.revision).toBe(2); expect(social.current.review_status).toBe("awaiting_review");
    expect(social.versions.find(v => v.revision === 1)?.review_status).toBe("changes_requested");
    expect(main.outputs.find(o => o.title === "Promotional Cutdown")?.review_status).toBe("not_submitted");
    expect(main.paymentPlan?.total_minor_units).toBe(1200000);
    expect(main.paymentPlan?.milestones.map(m => m.amount_minor_units)).toEqual([360000, 360000, 480000]);
    expect(main.paymentPlan?.milestones.filter(m => m.paid_at).reduce((sum,m) => sum + m.amount_minor_units,0)).toBe(720000);
    expect(projects.find(p => p.title === "Coffee, People & Place")?.status).toBe("booked");
    expect(projects.find(p => p.title === "Product Launch Film")?.status).toBe("completed");
    const dashboard = operations.getDashboard(); expect(dashboard.upcomingShoots.length).toBeGreaterThan(0); expect(dashboard.overdueTasks.length).toBeGreaterThan(0);
    expect(db.pragma("integrity_check", { simple: true })).toBe("ok"); expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(db.prepare("SELECT 1 FROM owner_account").get()).toBeUndefined();
  });
  it("preserves owner credentials, edits and dates on repeat seeding and after reopening", () => {
    db = openDemoDatabase(target, directory);
    const code = readLocalSetupCode(path.join(path.dirname(target), "owner-setup-code"));
    createAccessRepository(db).setup({ display_name: "Fictional demo owner", password: randomBytes(24).toString("base64url"), bootstrap_code: code }, code);
    const owner = db.prepare("SELECT * FROM owner_account").get();
    expect(seedDemoWorkspace(db, now)).toBe(true);
    db.prepare("UPDATE task SET title = 'Recording rehearsal edit' WHERE id = (SELECT id FROM task LIMIT 1)").run();
    const before = db.serialize(); expect(seedDemoWorkspace(db, new Date("2027-01-01"))).toBe(false); expect(db.serialize()).toEqual(before);
    db.close(); db = openDemoDatabase(target, directory);
    expect(seedDemoWorkspace(db, new Date("2027-01-01"))).toBe(false);
    expect(db.prepare("SELECT * FROM owner_account").get()).toEqual(owner);
    expect(db.prepare("SELECT 1 FROM task WHERE title = 'Recording rehearsal edit'").get()).toBeDefined();
    expect(fs.readFileSync(path.join(path.dirname(target), "owner-setup-code"), "utf8")).toBe(code);
  });
  it("rolls back fixture creation atomically when a domain insert fails", () => {
    db = openDemoDatabase(target, directory);
    db.exec("CREATE TRIGGER fail_demo BEFORE INSERT ON production_event BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
    expect(() => seedDemoWorkspace(db!, now)).toThrow("synthetic failure");
    for (const table of ["client", "project", "deliverable", "shoot", "task"]) expect(db.prepare(`SELECT count(*) AS total FROM ${table}`).get()).toEqual({ total: 0 });
  });
  it("runs setup and seed commands without introducing default credentials", () => {
    expect(cli("setup", target).status).toBe(0);
    expect(cli("seed", target).status).toBe(0);
    expect(cli("seed", target).stdout).toContain("retained unchanged");
    db = new Database(target, { readonly: true });
    expect(db.prepare("SELECT count(*) AS total FROM owner_account").get()).toEqual({ total: 0 });
    expect(db.prepare("SELECT count(*) AS total FROM project").get()).toEqual({ total: 3 });
  });
});
