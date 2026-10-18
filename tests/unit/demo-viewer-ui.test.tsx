import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openDemoDatabase, seedDemoWorkspace } from "../../scripts/demo-workspace";
import { createProductionRepository, type ProductionWorkspace } from "../../src/lib/production/repository";
import { WorkspaceViewerProvider, OwnerOnly } from "../../src/app/demo-viewer";
import { AppChrome } from "../../src/app/app-chrome";
import RootLayout from "../../src/app/layout";
import { DashboardView } from "../../src/app/page";
import ProjectsPage from "../../src/app/projects/page";
import ClientsPage from "../../src/app/clients/page";
import ClientPage from "../../src/app/clients/[id]/page";
import { ProductionWorkspaceView } from "../../src/app/projects/production-workspace";
import { ShootsSection, TasksSection, MoneySection } from "../../src/app/projects/[id]/workspace-sections";
import type { DashboardData } from "../../src/lib/operations/repository";

const mocks = vi.hoisted(() => ({ pathname: "/projects", read: vi.fn(), ownerAction: vi.fn() }));
vi.mock("../../src/lib/access/server", () => ({
  requireWorkspaceRead: mocks.read, requireOwnerAction: mocks.ownerAction,
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }), notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
type Viewer = "owner" | "demo_viewer";
const render = (viewer: Viewer, children: ReactNode) => renderToStaticMarkup(<WorkspaceViewerProvider viewer={viewer}>{children}</WorkspaceViewerProvider>);
describe("owner versus anonymous demo presentation", () => {
  let directory: string, db: Database.Database, workspace: ProductionWorkspace;
  const cache = globalThis as { __clckdApplicationDatabase?: Database.Database };
  beforeAll(() => {
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "0");
    directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "clckd-demo-ui-")));
    fs.mkdirSync(path.join(directory, "src/lib/db"), { recursive: true });
    fs.cpSync(path.join(root, "src/lib/db/migrations"), path.join(directory, "src/lib/db/migrations"), { recursive: true });
    const target = path.join(directory, "data/demo/clckd-demo.db");
    db = openDemoDatabase(target, directory); seedDemoWorkspace(db);
    vi.stubEnv("CLCKD_DB_PATH", target);
    const id = (db.prepare("SELECT id FROM project WHERE title = 'Autumn Brand Campaign'").get() as { id: string }).id;
    const value = createProductionRepository(db).getWorkspace(id)!;
    const review = value.outputs.find(output => output.current.review_status === "awaiting_review")!;
    workspace = { ...value, outputs: [review, ...value.outputs.filter(output => output.id !== review.id)] };
  });
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("CLCKD_READ_ONLY_DEMO", "0");
    mocks.pathname = "/projects"; mocks.read.mockResolvedValue({ role: "owner" });
  });
  afterAll(() => {
    if (cache.__clckdApplicationDatabase?.open) cache.__clckdApplicationDatabase.close();
    delete cache.__clckdApplicationDatabase;
    if (db?.open) db.close(); vi.unstubAllEnvs();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("hides owner navigation and shows the fictional-data notice without removing browse links", () => {
    const demo = render("demo_viewer", <AppChrome><p>Readable content</p></AppChrome>);
    expect(demo).toContain("Read-only demo"); expect(demo).toContain("All information is fictional.");
    expect(demo).toContain('href="/projects"'); expect(demo).toContain('href="/clients"');
    expect(demo).not.toMatch(/New project|Sign out|<form\b/);
    const owner = render("owner", <AppChrome><p>Readable content</p></AppChrome>);
    expect(owner).toContain("New project"); expect(owner).toContain("Sign out"); expect(owner).not.toContain("Read-only demo");
  });
  it("does not use query parameters to select the viewer state and defaults hidden without a provider", () => {
    mocks.pathname = "/projects?demo=1";
    expect(render("owner", <AppChrome>Content</AppChrome>)).toContain("Sign out");
    expect(renderToStaticMarkup(<OwnerOnly><button>Owner control</button></OwnerOnly>)).toBe("");
  });
  it("gets demo UI state from the existing server read guard only when explicitly enabled", async () => {
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "1"); mocks.read.mockResolvedValue({ role: "demo_viewer" });
    const html = renderToStaticMarkup(await RootLayout({ children: <p>Demo content</p> }));
    expect(mocks.read).toHaveBeenCalledOnce(); expect(html).toContain("Read-only demo"); expect(html).not.toContain("Sign out");
    mocks.read.mockRejectedValueOnce(new Error("Invalid fictional database"));
    await expect(RootLayout({ children: <p>Must not render</p> })).rejects.toThrow("Invalid fictional database");
  });
  it("preserves normal layout without adding a new authentication or database check", async () => {
    const html = renderToStaticMarkup(await RootLayout({ children: <p>Owner content</p> }));
    expect(mocks.read).not.toHaveBeenCalled(); expect(html).toContain("Sign out"); expect(html).not.toContain("Read-only demo");
  });
  it("hides client creation, archive and edit controls while retaining fictional profiles and projects", async () => {
    for (const viewer of ["owner", "demo_viewer"] as const) {
      mocks.read.mockResolvedValue({ role: viewer });
      const html = render(viewer, <>{await ClientsPage({ searchParams: Promise.resolve({}) })}{await ClientPage({ params: Promise.resolve({ id: workspace.project.client_id }), searchParams: Promise.resolve({}) })}{await ProjectsPage({ searchParams: Promise.resolve({}) })}</>);
      expect(html).toContain("Northstar Creative Studio"); expect(html).toContain("Autumn Brand Campaign");
      if (viewer === "demo_viewer") expect(html).not.toMatch(/New client|New project|Archive<|Edit client profile|Save client|<form\b/);
      else { expect(html).toContain("New client"); expect(html).toContain("Archive"); expect(html).toContain("Edit client profile"); expect(html).toContain("Save client"); }
    }
  });
  it("hides the empty-dashboard creation shortcut only for demo viewers", () => {
    const empty: DashboardData = { today: "2026-10-18", upcomingWindowDays: 14, activeProjects: [], upcomingShoots: [], overdueTasks: [], reviewQueue: [], moneyDue: [] };
    expect(render("demo_viewer", <DashboardView dashboard={empty} />)).not.toContain('href="/projects/new"');
    expect(render("owner", <DashboardView dashboard={empty} />)).toContain('href="/projects/new"');
  });
  it.each(["brief", "outputs", "shoot", "work", "review", "delivery", "payments", "client", "history"])("preserves readable %s content but removes mutation forms and edit disclosures", tab => {
    const view = <ProductionWorkspaceView workspace={workspace} initialTab={tab}
      shootsContent={<ShootsSection projectId={workspace.project.id} shoots={workspace.shoots} />}
      workContent={<TasksSection projectId={workspace.project.id} tasks={workspace.tasks} />}
      commercialContent={<MoneySection projectId={workspace.project.id} quote={null} invoices={[]} />} />;
    const demo = render("demo_viewer", view), owner = render("owner", view);
    expect(demo).toContain("Autumn Brand Campaign"); expect(demo).toContain('aria-label="Project sections"');
    expect(demo).not.toMatch(/<form\b|<input\b|<textarea\b|Edit shoot|Edit task|Add a shoot|Add a task|Record approval received|Record requested changes|Submit this version|Create and submit a new revision|Correct payment record|Record external payment|Revise the agreement|Reopen scope for agreed changes/);
    const ownerLabels: Record<string, string> = { brief: "Reopen scope for agreed changes", shoot: "Edit shoot", work: "Add task", review: "Record approval received", delivery: "Record output delivered", payments: "Record external payment" };
    if (ownerLabels[tab]) expect(owner).toContain(ownerLabels[tab]);
    if (tab === "payments") expect(demo).toContain("Final handover");
    if (tab === "history") expect(demo).toContain("Project decisions and activity");
    if (tab === "review") expect(demo).toContain("Version history");
  });
  it("hides editable output planning while retaining planned outputs and read-only output navigation", () => {
    const unconfirmed = { ...workspace, settings: { ...workspace.settings, scope_confirmed_at: null } };
    const view = <ProductionWorkspaceView workspace={unconfirmed} initialTab="outputs" shootsContent={null} workContent={null} commercialContent={null} />;
    const demo = render("demo_viewer", view), owner = render("owner", view);
    expect(demo).toContain("Promotional Cutdown"); expect(demo).toContain("Open this output");
    expect(demo).not.toMatch(/Edit planned output|Add a planned output|<form\b/);
    expect(owner).toContain("Edit planned output"); expect(owner).toContain("Add a planned output");
  });
});
