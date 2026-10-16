import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { openMigratedDatabase } from "../../src/lib/db/application";
import { createProductionRepository } from "../../src/lib/production/repository";
import { calculatePaymentPlan } from "../../src/lib/production/payments";
import { reviewSubmissionSchema } from "../../src/lib/production/schema";
import { createOperationsRepository } from "../../src/lib/operations/repository";

const plan = (shares = ["50", "50"], total = "5000.01", currency = "EUR") => ({ total, currency, contract_reference: "Fictional agreement A", terms: "Work commences after deposit; balance after delivery", milestones: shares.map((percentage, index) => ({ title: `Stage ${index + 1}`, percentage, payment_condition: index ? "After agreed delivery" : "Before work commences", due_date: null })) });
const setup = () => ({ client_id: null, new_client_name: "Fictional client", title: "Payment test", production_type: "film", approver_name: "Fictional approver", shoot_date: null, target_date: null, location: null, location_tz: "Europe/Paris", notes: null, outputs: [{ title: "Film", type: "final_master", format: "4K", quantity: 1, revision_allowance: 2, due_date: null }] });
describe("payment agreement tracking", () => {
  let directory: string;
  let db: Database.Database;
  let repo: ReturnType<typeof createProductionRepository>;
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "clckd-payments-")); db = openMigratedDatabase({ dbPath: path.join(directory, "test.db") }); repo = createProductionRepository(db); });
  afterEach(() => { if (db.open) db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  it.each([["50", "50"], ["30", "30", "40"], ["20", "5", "10", "15", "20", "5", "15", "10"], ["33.33", "33.33", "33.34"]])("allocates exact fee for split %j", (...shares: string[]) => {
    const value = calculatePaymentPlan(plan(shares));
    expect(value.milestones.reduce((sum, item) => sum + item.amount_minor_units, 0)).toBe(500001);
    expect(value.milestones.every((item) => item.amount_minor_units > 0)).toBe(true);
  });
  it("supports zero-decimal currencies and deterministic remainder rounding", () => {
    expect(calculatePaymentPlan(plan(["50", "50"], "101", "JPY")).milestones.map((item) => item.amount_minor_units)).toEqual([51, 50]);
    expect(() => calculatePaymentPlan(plan(["50", "50"], "1.20", "JPY"))).toThrow("decimal");
  });
  it("rejects invalid shares, totals, excessive precision and missing conditions", () => {
    for (const shares of [["30", "30"], ["0", "100"], ["101"], ["50.001", "49.999"]]) expect(() => calculatePaymentPlan(plan(shares))).toThrow();
    expect(() => calculatePaymentPlan(plan(["50", "50"], "0"))).toThrow();
    expect(() => calculatePaymentPlan(plan(["50", "50"], "0.01"))).toThrow("too small");
    const invalid = plan(); invalid.milestones[0].payment_condition = "";
    expect(() => calculatePaymentPlan(invalid)).toThrow();
  });
  it("creates payment structure atomically and persists across reopening", () => {
    const id = repo.createProduction({ ...setup(), payment_plan: plan(["30", "30", "40"]) });
    db.close(); db = openMigratedDatabase({ dbPath: path.join(directory, "test.db") }); repo = createProductionRepository(db);
    expect(repo.getWorkspace(id)?.paymentPlan).toMatchObject({ revision: 1, total_minor_units: 500001, currency: "EUR", terms: plan().terms });
    expect(repo.getWorkspace(id)?.paymentPlan?.milestones).toHaveLength(3);
    expect(() => repo.createProduction({ ...setup(), payment_plan: plan(["30", "30"]) })).toThrow();
    expect((db.prepare("SELECT COUNT(*) AS n FROM project").get() as { n: number }).n).toBe(1);
  });
  it("retains old schedules, reopens scope, rejects stale plan saves", () => {
    const id = repo.createProduction({ ...setup(), payment_plan: plan() }); repo.confirmScope(id, 1, true);
    repo.savePaymentPlan(id, 1, plan(["30", "30", "40"]));
    expect(repo.getWorkspace(id)?.settings).toMatchObject({ scope_revision: 2, scope_confirmed_at: null });
    expect(repo.getWorkspace(id)?.paymentPlan?.revision).toBe(2);
    expect((db.prepare("SELECT COUNT(*) AS n FROM production_payment_milestone WHERE project_id = ?").get(id) as { n: number }).n).toBe(5);
    expect(() => repo.savePaymentPlan(id, 1, plan())).toThrow("changed");
  });
  it("records external payment idempotently, requires acknowledgment and protects paid plans", () => {
    const id = repo.createProduction({ ...setup(), payment_plan: plan() });
    const item = repo.getWorkspace(id)!.paymentPlan!.milestones[0];
    const input = { milestone_id: item.id, expected_plan_revision: 1, kind: "paid", confirmed: true, reference: "External receipt TEST-01" };
    expect(() => repo.recordMilestonePayment(id, { ...input, confirmed: false })).toThrow("Confirm");
    repo.recordMilestonePayment(id, input); repo.recordMilestonePayment(id, input);
    expect(repo.getWorkspace(id)?.events.filter((event) => event.kind === "external_payment_recorded")).toHaveLength(1);
    expect(() => repo.savePaymentPlan(id, 1, plan())).toThrow("recorded payments");
    expect(repo.getWorkspace(id)?.settings.scope_confirmed_at).toBeNull();
    expect(repo.getWorkspace(id)?.outputs[0].current.review_status).toBe("not_submitted");
    repo.recordMilestonePayment(id, { ...input, kind: "correction", reference: "Receipt belonged to another project" });
    expect(repo.getWorkspace(id)?.paymentPlan?.milestones[0].paid_at).toBeNull();
    expect(repo.getWorkspace(id)?.events.some((event) => event.kind === "payment_record_corrected")).toBe(true);
  });
  it("rejects cross-project, stale and archived payment changes", () => {
    const id = repo.createProduction({ ...setup(), payment_plan: plan() }); const other = repo.createProduction(setup());
    const input = { milestone_id: repo.getWorkspace(id)!.paymentPlan!.milestones[0].id, expected_plan_revision: 1, kind: "paid", confirmed: true, reference: "TEST" };
    expect(() => repo.recordMilestonePayment(other, input)).toThrow();
    repo.savePaymentPlan(id, 1, plan()); expect(() => repo.recordMilestonePayment(id, input)).toThrow("changed");
    db.prepare("UPDATE project SET archived_at = ? WHERE id = ?").run(new Date().toISOString(), id);
    expect(() => repo.savePaymentPlan(id, 2, plan())).toThrow("Restore");
  });
  it("gates production, post-production and delivery without blocking the recording of shoot completion", () => {
    const schedule = plan(["30", "30", "40"]);
    const gated = { ...schedule, milestones: schedule.milestones.map((item, index) => ({ ...item, work_gate: ["production", "post_production", "delivery"][index] })) };
    const id = repo.createProduction({ ...setup(), shoot_date: "2026-10-20", payment_plan: gated }); repo.confirmScope(id, 1, true);
    const pay = (index: number) => repo.recordMilestonePayment(id, { milestone_id: repo.getWorkspace(id)!.paymentPlan!.milestones[index].id, expected_plan_revision: 1, kind: "paid", confirmed: true, reference: "Fictional receipt" });
    expect(() => repo.startProduction(id)).toThrow("Before production");
    const operations = createOperationsRepository(db); const project = operations.getProject(id)!;
    expect(() => operations.updateProject(id, { client_id: project.client_id, title: project.title, status: "in_production", start_date: project.start_date, end_date: project.end_date, location: project.location, budget_minor_units: project.budget_minor_units, budget_currency: project.budget_currency, notes: project.notes })).toThrow("Before production");
    pay(0); repo.startProduction(id);
    expect(() => repo.startPostProduction(id)).toThrow("Record the planned shoot");
    repo.completeShoot(id, true);
    expect(() => repo.startPostProduction(id)).toThrow("Before post production");
    expect(repo.getWorkspace(id)?.settings.shoot_completed_at).not.toBeNull();
    expect(repo.getWorkspace(id)?.project.status).toBe("in_production");
    const output = repo.getWorkspace(id)!.outputs[0];
    const expected = { project_id: id, output_id: output.id, expected_revision: 1, expected_scope_revision: 1, expected_link: null };
    expect(() => repo.submitReview({ ...expected, link: "https://example.com/review", new_revision: false, change_note: null })).toThrow("Before post production");
    expect(repo.getWorkspace(id)?.outputs[0].current.link).toBeNull();
    pay(1); repo.startPostProduction(id); repo.startPostProduction(id);
    expect(repo.getWorkspace(id)?.events.filter((event) => event.kind === "post_production_started")).toHaveLength(1);
    repo.submitReview({ ...expected, link: "https://example.com/review", new_revision: false, change_note: null });
    const submitted = { ...expected, expected_link: "https://example.com/review", confirmed: true, details: null };
    repo.recordDecision({ ...submitted, kind: "approve" });
    expect(() => repo.recordDecision({ ...submitted, kind: "deliver" })).toThrow("Before delivery");
    expect(repo.getWorkspace(id)?.outputs[0].current.delivered_at).toBeNull();
    pay(2); repo.recordDecision({ ...submitted, kind: "deliver" }); repo.wrapProject(id);
    expect(repo.getWorkspace(id)?.project.status).toBe("completed");
  });
});
describe("review web links", () => {
  const input = { project_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", output_id: "01ARZ3NDEKTSV4RRFFQ69G5FAW", expected_revision: 1, expected_link: null, expected_scope_revision: 1, new_revision: false, change_note: null };
  it.each(["https://vimeo.com/123", "https://drive.google.com/file/d/example/view?usp=sharing", "https://app.frame.io/reviews/example", "https://example.com/video.mp4"])('accepts web link %s', (link) => { expect(reviewSubmissionSchema.parse({ ...input, link }).link).toBe(link); });
  it("normalizes pasted bare web addresses", () => { expect(reviewSubmissionSchema.parse({ ...input, link: " vimeo.com/123 " }).link).toBe("https://vimeo.com/123"); });
  it.each(["http://example.com/video", "javascript:alert(1)", "file:///private/video.mp4", "data:text/html,hi", "ftp://example.com", "not a link", "https://user:password@example.com"])('rejects unsafe/non-web link %s', (link) => { expect(reviewSubmissionSchema.safeParse({ ...input, link }).success).toBe(false); });
});

describe("draft payment schema compatibility", () => {
  it.each([true, false])("preserves paid records and original revisions (unversioned draft: %s)", (legacy) => {
    const fixture = new Database(":memory:");
    try {
      fixture.pragma("foreign_keys=ON"); fixture.exec("CREATE TABLE project(id TEXT PRIMARY KEY); INSERT INTO project VALUES ('P');");
      let sql = fs.readFileSync("src/lib/db/migrations/0003_payment_plan.up.sql", "utf8");
      if (legacy) sql = sql.replace("project_id TEXT NOT NULL REFERENCES project(id)", "project_id TEXT NOT NULL PRIMARY KEY REFERENCES project(id)").replace(",\n  PRIMARY KEY (project_id, revision)", "").replace("  plan_revision INTEGER NOT NULL,\n", "").replace("FOREIGN KEY (project_id, plan_revision) REFERENCES production_payment_plan(project_id, revision)", "FOREIGN KEY (project_id) REFERENCES production_payment_plan(project_id)").replace("UNIQUE (project_id, plan_revision, position)", "UNIQUE (project_id, position)");
      fixture.exec(sql); fixture.exec(fs.readFileSync("src/lib/db/migrations/0004_payment_work_gates.up.sql", "utf8"));
      for (const revision of legacy ? [2] : [1, 2]) {
        fixture.prepare("INSERT INTO production_payment_plan (project_id,total_minor_units,currency,revision,created_at,updated_at) VALUES ('P',100,'EUR',?,'T','T')").run(revision);
        const fields = legacy ? "id,project_id,position,title,basis_points,amount_minor_units,payment_condition,paid_at,payment_reference,work_gate,created_at,updated_at" : "id,project_id,plan_revision,position,title,basis_points,amount_minor_units,payment_condition,paid_at,payment_reference,work_gate,created_at,updated_at";
        const values = legacy ? "?,'P',0,'Deposit',10000,100,'Before production','T','receipt','production','T','T'" : "?,'P',?,0,'Deposit',10000,100,'Before production','T','receipt','production','T','T'";
        fixture.prepare(`INSERT INTO production_payment_milestone (${fields}) VALUES (${values})`).run(...(legacy ? [`M${revision}`] : [`M${revision}`, revision]));
      }
      fixture.transaction(() => fixture.exec(fs.readFileSync("src/lib/db/migrations/0005_payment_schema_checkpoint.up.sql", "utf8")))();
      const rows = fixture.prepare("SELECT plan_revision,paid_at,payment_reference,work_gate FROM production_payment_milestone ORDER BY plan_revision").all();
      expect(rows).toEqual((legacy ? [2] : [1, 2]).map((plan_revision) => ({ plan_revision, paid_at: "T", payment_reference: "receipt", work_gate: "production" })));
      expect(fixture.pragma("foreign_key_check")).toEqual([]);
      expect((fixture.prepare("SELECT COUNT(*) n FROM production_payment_milestone_draft_archive").get() as { n: number }).n).toBe(rows.length);
      fixture.exec(fs.readFileSync("src/lib/db/migrations/0005_payment_schema_checkpoint.down.sql", "utf8"));
      expect((fixture.prepare("SELECT COUNT(*) n FROM production_payment_milestone_versioned_archive").get() as { n: number }).n).toBe(rows.length);
    } finally { fixture.close(); }
  });
});
