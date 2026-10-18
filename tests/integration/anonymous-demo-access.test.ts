import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDemoDatabase, seedDemoWorkspace } from "../../scripts/demo-workspace";
import { getApplicationDatabase } from "../../src/lib/db/application";
import { DEMO_FIXTURE_DIGEST_KEY } from "../../src/lib/db/demo-database";
import { createAccessRepository } from "../../src/lib/access/repository";
import { requireOwnerAction, requireOwnerPage, requireWorkspaceRead } from "../../src/lib/access/server";
import DashboardPage from "../../src/app/page";
import ProjectsPage from "../../src/app/projects/page";
import ClientsPage from "../../src/app/clients/page";
import ProjectPage, { generateMetadata as projectMetadata } from "../../src/app/projects/[id]/page";
import ClientPage, { generateMetadata as clientMetadata } from "../../src/app/clients/[id]/page";
import NewProjectPage from "../../src/app/projects/new/page";
import NewClientPage from "../../src/app/clients/new/page";

const browser = vi.hoisted(() => ({ getCookie: vi.fn(), cookies: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "127.0.0.1:3301", origin: "http://127.0.0.1:3301" }), cookies: browser.cookies }));
vi.mock("next/navigation", () => ({ redirect: (value: string) => { throw new Error(`REDIRECT:${value}`); }, notFound: () => { throw new Error("NOT_FOUND"); }, useRouter: vi.fn(), usePathname: () => "/" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cache = globalThis as { __clckdApplicationDatabase?: Database.Database };
describe("anonymous demo reads without owner privileges", () => {
  let directory: string, target: string, projectId: string, clientId: string, normalOwnerToken: string;
  const connections: Database.Database[] = [];
  beforeEach(() => {
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "0");
    directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "clckd-anonymous-test-")));
    target = path.join(directory, "data/demo/clckd-demo.db");
    fs.mkdirSync(path.join(directory, "src/lib/db"), { recursive: true });
    fs.cpSync(path.join(root, "src/lib/db/migrations"), path.join(directory, "src/lib/db/migrations"), { recursive: true });
    const db = openDemoDatabase(target, directory); connections.push(db); seedDemoWorkspace(db);
    projectId = (db.prepare("SELECT id FROM project WHERE title = 'Autumn Brand Campaign'").get() as { id: string }).id;
    clientId = (db.prepare("SELECT client_id FROM project WHERE id = ?").get(projectId) as { client_id: string }).client_id;
    // The owner remains private; this session must never be needed by a demo visitor.
    const code = randomBytes(32).toString("hex");
    normalOwnerToken = createAccessRepository(db).setup({ display_name: "PRIVATE-OWNER-CANARY", password: randomBytes(32).toString("hex"), bootstrap_code: code }, code).token;
    db.close();
    vi.spyOn(process, "cwd").mockReturnValue(directory);
    vi.stubEnv("CLCKD_DB_PATH", target); vi.stubEnv("CLCKD_READ_ONLY_DEMO", "1");
    vi.clearAllMocks(); browser.getCookie.mockReturnValue(undefined); browser.cookies.mockResolvedValue({ get: browser.getCookie });
  });
  afterEach(() => {
    if (cache.__clckdApplicationDatabase?.open) cache.__clckdApplicationDatabase.close();
    delete cache.__clckdApplicationDatabase;
    for (const db of connections.splice(0)) if (db.open) db.close();
    vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true });
  });
  function writable() { const db = new Database(target); connections.push(db); return db; }
  const query = () => Promise.resolve({});
  const props = () => ({ params: Promise.resolve({ id: projectId }), searchParams: query() });

  it("allows dashboard, clients, projects and safe details without reading cookies or changing any data", async () => {
    const db = getApplicationDatabase(), snapshot = db.serialize();
    await expect(requireWorkspaceRead()).resolves.toEqual({ role: "demo_viewer" });
    const results = await Promise.all([DashboardPage(), ProjectsPage({ searchParams: query() }), ClientsPage({ searchParams: query() }), ProjectPage(props()), ClientPage({ params: Promise.resolve({ id: clientId }), searchParams: query() })]);
    // Inspect response props, not React/Next component implementation objects.
    const serialized = JSON.stringify(results, (_key, value: unknown) => isValidElement(value) ? { props: value.props } : value);
    expect(serialized).toContain("Autumn Brand Campaign");
    expect(serialized).not.toMatch(/PRIVATE-OWNER-CANARY|password_hash|token_hash|Invitations issued|Project archive controls/);
    expect(browser.cookies).not.toHaveBeenCalled(); expect(db.serialize()).toEqual(snapshot);
  });
  it("guards project/client metadata while allowing safe fictional titles", async () => {
    await expect(projectMetadata({ params: Promise.resolve({ id: projectId }) })).resolves.toEqual({ title: "Autumn Brand Campaign" });
    await expect(clientMetadata({ params: Promise.resolve({ id: clientId }) })).resolves.toEqual({ title: "Northstar Creative Studio" });
    expect(browser.cookies).not.toHaveBeenCalled();
  });
  it("denies owner pages, creation screens, owner actions and invitation administration even with a supplied owner cookie", async () => {
    browser.getCookie.mockReturnValue({ value: "0".repeat(64) });
    await expect(requireOwnerPage()).rejects.toThrow("Owner operations");
    await expect(NewProjectPage({ searchParams: query() })).rejects.toThrow("Owner operations");
    await expect(NewClientPage()).rejects.toThrow("Owner operations");
    await expect(requireOwnerAction()).rejects.toThrow("read-only");
    expect(() => createAccessRepository(getApplicationDatabase()).listInvitations(undefined, projectId)).toThrow();
    expect(browser.cookies).not.toHaveBeenCalled();
  });
  it.each([undefined, "0"])("keeps anonymous normal-mode reads denied when flag is %s", async value => {
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", value);
    await expect(requireWorkspaceRead()).rejects.toThrow("REDIRECT:/access");
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/access");
    await expect(projectMetadata({ params: Promise.resolve({ id: projectId }) })).rejects.toThrow("REDIRECT:/access");
  });
  it("retains normal owner access through the existing session verification", async () => {
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "0");
    browser.getCookie.mockReturnValue({ value: normalOwnerToken });
    await expect(requireWorkspaceRead()).resolves.toEqual({ role: "owner" });
    await expect(requireOwnerPage()).resolves.toMatchObject({ display_name: "PRIVATE-OWNER-CANARY" });
    expect(browser.cookies).toHaveBeenCalled();
  });
  it.each([undefined, "data/app.db", ":memory:"])("exposes no page for unsafe database configuration %s", async value => {
    vi.stubEnv("CLCKD_DB_PATH", value);
    await expect(DashboardPage()).rejects.toThrow("explicitly");
    await expect(projectMetadata({ params: Promise.resolve({ id: projectId }) })).rejects.toThrow("explicitly");
    expect(fs.existsSync(path.join(directory, "data/app.db"))).toBe(false);
  });
  it("refuses a missing, unmarked or unattested fixture without returning page data", async () => {
    const db = writable(); db.pragma("application_id = 0");
    await expect(ProjectPage(props())).rejects.toThrow("marked fictional");
    db.pragma("application_id = 1129071693");
    db.prepare("DELETE FROM kv_meta WHERE key = ?").run(DEMO_FIXTURE_DIGEST_KEY);
    await expect(ProjectPage(props())).rejects.toThrow("freshly seeded");
  });
  it("detects private edits even on a cached validated database and never silently re-attests it", async () => {
    await requireWorkspaceRead();
    const db = writable();
    db.prepare("UPDATE project SET notes = 'PRIVATE-RECORD-CANARY' WHERE id = ?").run(projectId);
    await expect(ProjectPage(props())).rejects.toThrow("freshly seeded");
    await expect(projectMetadata({ params: Promise.resolve({ id: projectId }) })).rejects.toThrow("freshly seeded");
    const snapshot = db.serialize(); vi.stubEnv("CLCKD_READ_ONLY_DEMO", "0");
    expect(seedDemoWorkspace(db)).toBe(false); expect(db.serialize()).toEqual(snapshot);
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "1"); await expect(ClientsPage({ searchParams: query() })).rejects.toThrow("freshly seeded");
  });
  it("fails closed on invalid mode values and missing database files", async () => {
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "true"); await expect(DashboardPage()).rejects.toThrow("0 or 1");
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "1");
    const missingRoot = path.join(directory, "missing"); fs.mkdirSync(missingRoot);
    vi.mocked(process.cwd).mockReturnValue(missingRoot); vi.stubEnv("CLCKD_DB_PATH", path.join(missingRoot, "data/demo/clckd-demo.db"));
    await expect(DashboardPage()).rejects.toThrow();
    expect(fs.existsSync(path.join(missingRoot, "data"))).toBe(false);
  });
});
