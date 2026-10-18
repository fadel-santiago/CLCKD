import type Database from "better-sqlite3";
import { ulid } from "ulid";
import { z } from "zod";
import { createClientRepository } from "../clients/repository";
import { createOperationsRepository, type ProjectWithClient } from "../operations/repository";
import { deliverableRecordSchema, shootInputSchema, type Deliverable, type Project, type Shoot, type Task } from "../operations/schema";
import { expectedOutputSchema, outputDecisionSchema, outputSetupSchema, productionSetupSchema, recordId, reviewSubmissionSchema, type OutputSetup } from "./schema";
import { isValidIsoDate } from "../operations/dates";
import { calculatePaymentPlan, assertPaymentWorkGate, type PaymentPlan, type PaymentMilestone } from "./payments";

export interface ProductionSettings {
  project_id: string;
  production_type: "film" | "photography" | "event" | "custom";
  approver_name: string | null;
  scope_revision: number;
  scope_confirmed_at: string | null;
  shoot_completed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface OutputVersion {
  deliverable_id: string;
  revision: number;
  title: string;
  link: string | null;
  change_note: string | null;
  feedback: string | null;
  review_status: Deliverable["review_status"];
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface ProductionOutput extends Deliverable {
  format: string | null;
  quantity: number;
  revision_allowance: number;
  current: OutputVersion;
  versions: OutputVersion[];
  scope_revision: number;
}
export interface ProductionEvent {
  id: string;
  project_id: string;
  deliverable_id: string | null;
  revision: number | null;
  kind: string;
  attributed_to: string | null;
  details: string | null;
  source: "local_operator";
  created_at: string;
}
export interface ProductionWorkspace {
  project: ProjectWithClient;
  settings: ProductionSettings;
  outputs: ProductionOutput[];
  shoots: Shoot[];
  tasks: Task[];
  events: ProductionEvent[];
  readyToWrap: boolean;
  archivedOutputs: Deliverable[];
  archivedShoots: Shoot[];
  archivedTasks: Task[];
  paymentPlan: PaymentPlan | null;
}

export function createProductionRepository(db: Database.Database, dependencies: { now?: () => Date; generateId?: () => string } = {}) {
  const now = dependencies.now ?? (() => new Date());
  const generateId = dependencies.generateId ?? (() => ulid());
  const operations = createOperationsRepository(db, { now, generateId });
  const timestamp = () => now().toISOString();

  function project(id: string, active = true): ProjectWithClient {
    recordId.parse(id);
    const value = operations.getProject(id);
    if (!value) throw new Error("Project not found");
    if (active && value.archived_at) throw new Error("Restore the project before changing it");
    return value;
  }
  function settings(id: string): ProductionSettings {
    const value = project(id, false);
    if (!db.readonly) db.prepare(`INSERT OR IGNORE INTO production_project (project_id, created_at, updated_at) VALUES (?, ?, ?)`)
      .run(id, value.created_at, value.updated_at);
    const result = db.prepare(`SELECT * FROM production_project WHERE project_id = ?`).get(id) as ProductionSettings | undefined;
    if (!result) throw new Error("Prepare the production settings before opening the read-only demo.");
    return result;
  }
  function event(projectId: string, kind: string, details: string | null = null, outputId: string | null = null, revision: number | null = null, attributedTo: string | null = null): void {
    db.prepare(`INSERT INTO production_event (id, project_id, deliverable_id, revision, kind, attributed_to, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(generateId(), projectId, outputId, revision, kind, attributedTo, details, timestamp());
  }
  function ensureOutput(value: Deliverable): void {
    if (db.readonly) return;
    db.prepare(`INSERT OR IGNORE INTO output_spec (deliverable_id, created_at, updated_at) VALUES (?, ?, ?)`)
      .run(value.id, value.created_at, value.updated_at);
    db.prepare(`INSERT OR IGNORE INTO output_version (deliverable_id, revision, title, link, review_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(value.id, value.revision, value.title, value.link, value.review_status, value.created_at, value.updated_at);
  }
  function output(projectId: string, outputId: string): ProductionOutput {
    project(projectId);
    recordId.parse(outputId);
    const raw = db.prepare(`SELECT * FROM deliverable WHERE id = ? AND project_id = ? AND archived_at IS NULL`).get(outputId, projectId);
    if (!raw) throw new Error("Output not found in this active project");
    const value = deliverableRecordSchema.parse(raw);
    ensureOutput(value);
    const spec = db.prepare(`SELECT format, quantity, revision_allowance FROM output_spec WHERE deliverable_id = ?`).get(value.id) as Pick<ProductionOutput, "format" | "quantity" | "revision_allowance">;
    const versions = db.prepare(`SELECT * FROM output_version WHERE deliverable_id = ? ORDER BY revision DESC`).all(value.id) as OutputVersion[];
    const current = versions.find((item) => item.revision === value.revision);
    if (!current) throw new Error("Current output version is unavailable");
    return { ...value, ...spec, current, versions, scope_revision: settings(projectId).scope_revision };
  }
  function expected(input: unknown) {
    const parsed = expectedOutputSchema.parse(input);
    const value = output(parsed.project_id, parsed.output_id);
    if (value.scope_revision !== parsed.expected_scope_revision) throw new Error("Project scope changed. Reload before recording a decision or revision.");
    if (value.revision !== parsed.expected_revision || value.current.link !== parsed.expected_link) {
      throw new Error("This output changed. Reload and check the current version before continuing.");
    }
    return value;
  }
  function advance(id: string, target: Project["status"]): void {
    let current = project(id);
    const routes: Partial<Record<Project["status"], Project["status"][]>> = {
      lead: ["proposed", "booked", "in_production", "post_production", "completed"],
      proposed: ["booked", "in_production", "post_production", "completed"],
      booked: ["in_production", "post_production", "completed"],
      in_production: ["post_production", "completed"],
      post_production: ["completed"],
      completed: ["in_production", "post_production"],
      on_hold: ["booked", "in_production", "post_production", "completed"],
    };
    if (current.status === target) return;
    const route = routes[current.status] ?? [];
    const end = route.indexOf(target);
    if (end < 0) return;
    for (const status of route.slice(0, end + 1)) {
      const { client_id, title, start_date, end_date, location, budget_minor_units, budget_currency, notes } = current;
      const updated = operations.updateProject(id, { client_id, title, start_date, end_date, location, budget_minor_units, budget_currency, notes, status });
      if (!updated) throw new Error("Project could not be advanced");
      current = updated;
    }
  }
  function addOutput(projectId: string, input: OutputSetup): ProductionOutput {
    const value = outputSetupSchema.parse(input);
    const created = operations.createDeliverable({ project_id: projectId, type: value.type, title: value.title, due_date: value.due_date, review_status: "not_submitted", revision: 1, link: null, notes: null });
    ensureOutput(created);
    db.prepare(`UPDATE output_spec SET format = ?, quantity = ?, revision_allowance = ?, updated_at = ? WHERE deliverable_id = ?`)
      .run(value.format, value.quantity, value.revision_allowance, timestamp(), created.id);
    return output(projectId, created.id);
  }

  function paymentPlan(id: string): PaymentPlan | null {
    const plan = db.prepare(`SELECT * FROM production_payment_plan WHERE project_id = ? ORDER BY revision DESC LIMIT 1`).get(id) as Omit<PaymentPlan, "milestones"> | undefined;
    if (!plan) return null;
    return { ...plan, milestones: db.prepare(`SELECT * FROM production_payment_milestone WHERE project_id = ? AND plan_revision = ? ORDER BY position`).all(id, plan.revision) as PaymentMilestone[] };
  }
  function insertPaymentPlan(id: string, input: unknown, revision: number): void {
    const value = calculatePaymentPlan(input);
    db.prepare(`INSERT INTO production_payment_plan (project_id, total_minor_units, currency, contract_reference, terms, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, value.total_minor_units, value.currency, value.contract_reference, value.terms, revision, timestamp(), timestamp());
    for (const [position, item] of value.milestones.entries()) {
      db.prepare(`INSERT INTO production_payment_milestone (id, project_id, plan_revision, position, title, basis_points, amount_minor_units, payment_condition, due_date, work_gate, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(generateId(), id, revision, position, item.title, item.basis_points, item.amount_minor_units, item.payment_condition, item.due_date, item.work_gate, timestamp(), timestamp());
    }
    event(id, "payment_plan_saved", `Payment plan v${revision}; ${value.milestones.map((item) => item.percentage + "% " + item.title).join(" / ")}; external payments only`);
  }

  return {
    getWorkspace(id: string): ProductionWorkspace | null {
      const value = operations.getProject(recordId.parse(id));
      if (!value) return null;
      const options = settings(id);
      const outputs = value.archived_at ? [] : operations.listDeliverables(id).map((item) => output(id, item.id));
      return { project: value, settings: options, paymentPlan: paymentPlan(id), outputs, shoots: operations.listShoots(id), tasks: operations.listTasks(id), events: db.prepare(`SELECT * FROM production_event WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`).all(id) as ProductionEvent[], readyToWrap: outputs.length > 0 && outputs.every((item) => item.current.delivered_at !== null), archivedOutputs: db.prepare(`SELECT * FROM deliverable WHERE project_id = ? AND archived_at IS NOT NULL ORDER BY created_at`).all(id) as Deliverable[], archivedShoots: db.prepare(`SELECT * FROM shoot WHERE project_id = ? AND archived_at IS NOT NULL ORDER BY shoot_date`).all(id) as Shoot[], archivedTasks: db.prepare(`SELECT * FROM task WHERE project_id = ? AND archived_at IS NOT NULL ORDER BY created_at`).all(id) as Task[] };
    },

    createProduction(input: unknown): string {
      const value = productionSetupSchema.parse(input);
      return db.transaction(() => {
        const clientId = value.client_id ?? createClientRepository(db, { now, generateId }).createClient({ name: value.new_client_name!, kind: "organization" }).id;
        const created = operations.createProject({ client_id: clientId, title: value.title, status: "proposed", start_date: value.shoot_date, end_date: value.target_date, location: value.location, budget_minor_units: null, budget_currency: null, notes: value.notes });
        db.prepare(`INSERT INTO production_project (project_id, production_type, approver_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
          .run(created.id, value.production_type, value.approver_name, timestamp(), timestamp());
        for (const item of value.outputs) addOutput(created.id, item);
        if (value.shoot_date) operations.createShoot({ project_id: created.id, shoot_date: value.shoot_date, call_time_local: null, location_tz: value.location_tz, location: value.location || "Location to confirm", crew_notes: null });
        const stages = value.production_type === "photography" ? ["Prepare photo session", "Select proofs", "Retouch selected images", "Prepare final gallery"] : ["Prepare shoot", "Edit first version", "Finish approved masters"];
        for (const title of stages) operations.createTask({ project_id: created.id, title, description: null, priority: "normal", due_date: null, status: "todo" });
        event(created.id, "project_created", `${value.outputs.length} planned outputs`);
        if (value.payment_plan) insertPaymentPlan(created.id, value.payment_plan, 1);
        return created.id;
      }).immediate();
    },

    savePaymentPlan(id: string, expectedRevision: number, input: unknown): void {
      // Validate before writing; old plans are retained rather than overwritten.
      calculatePaymentPlan(input);
      db.transaction(() => {
        project(id);
        const existing = paymentPlan(id);
        if ((existing?.revision ?? 0) !== expectedRevision) throw new Error("Payment plan changed. Reload before saving.");
        if (existing?.milestones.some((item) => item.paid_at)) throw new Error("This plan has recorded payments. Preserve it; correct mistaken payment records before replacing the agreement.");
        settings(id);
        insertPaymentPlan(id, input, expectedRevision + 1);
        db.prepare(`UPDATE production_project SET scope_revision = scope_revision + 1, scope_confirmed_at = NULL, updated_at = ? WHERE project_id = ?`).run(timestamp(), id);
        event(id, "scope_revised", "Payment agreement updated; scope requires confirmation");
      }).immediate();
    },

    recordMilestonePayment(id: string, input: unknown): void {
      const value = z.strictObject({ milestone_id: recordId, expected_plan_revision: z.number().int().min(1), kind: z.enum(["paid", "correction"]), confirmed: z.boolean(), reference: z.string().trim().min(1, "Add a payment reference or correction reason").max(1000) }).parse(input);
      db.transaction(() => {
        project(id);
        if (!value.confirmed) throw new Error("Confirm this is an external payment record, not a transfer through CLCKD");
        const plan = paymentPlan(id);
        if (!plan || plan.revision !== value.expected_plan_revision) throw new Error("Payment plan changed. Reload before recording payment.");
        const item = plan.milestones.find((milestone) => milestone.id === value.milestone_id);
        if (!item) throw new Error("Payment milestone not found in this project");
        if (value.kind === "paid" && item.paid_at) return;
        if (value.kind === "correction" && !item.paid_at) throw new Error("No recorded payment to correct");
        db.prepare(`UPDATE production_payment_milestone SET paid_at = ?, payment_reference = ?, updated_at = ? WHERE id = ?`).run(value.kind === "paid" ? timestamp() : null, value.kind === "paid" ? value.reference : null, timestamp(), item.id);
        event(id, value.kind === "paid" ? "external_payment_recorded" : "payment_record_corrected", `${item.title}: ${value.reference}; plan v${plan.revision}; no funds moved`);
      }).immediate();
    },

    updateSettings(id: string, input: unknown): void {
      const value = z.strictObject({ production_type: z.enum(["film", "photography", "event", "custom"]), approver_name: z.string().trim().min(1).max(200), target_date: z.string().refine(isValidIsoDate, "Use a valid target date").nullable().optional(), notes: z.string().trim().max(5000).nullable().optional() }).parse(input);
      db.transaction(() => {
        const currentProject = project(id);
        const previous = settings(id);
        if (value.target_date !== undefined || value.notes !== undefined) {
          const { client_id, title, status, start_date, location, budget_minor_units, budget_currency } = currentProject;
          operations.updateProject(id, { client_id, title, status, start_date, location, budget_minor_units, budget_currency, end_date: value.target_date === undefined ? currentProject.end_date : value.target_date, notes: value.notes === undefined ? currentProject.notes : value.notes });
        }
        db.prepare(`UPDATE production_project SET production_type = ?, approver_name = ?, scope_revision = scope_revision + 1, scope_confirmed_at = NULL, updated_at = ? WHERE project_id = ?`)
          .run(value.production_type, value.approver_name, timestamp(), id);
        event(id, "scope_revised", `Scope ${previous.scope_revision + 1}; approver ${value.approver_name}`);
      }).immediate();
    },

    saveOutput(projectId: string, outputId: string | null, input: unknown): string {
      const value = outputSetupSchema.parse(input);
      return db.transaction(() => {
        project(projectId);
        const options = settings(projectId);
        if (options.scope_confirmed_at) throw new Error("Reopen the project scope before changing agreed outputs");
        if (!outputId) {
          const created = addOutput(projectId, value);
          event(projectId, "output_planned", value.title, created.id, 1);
          return created.id;
        }
        const existing = output(projectId, outputId);
        if (existing.current.submitted_at || existing.review_status !== "not_submitted") throw new Error("Submitted output specifications are preserved. Add a new output for additional scope.");
        operations.updateDeliverable(outputId, { project_id: projectId, title: value.title, type: value.type, due_date: value.due_date, review_status: "not_submitted", revision: existing.revision, link: existing.link, notes: existing.notes });
        db.prepare(`UPDATE output_spec SET format = ?, quantity = ?, revision_allowance = ?, updated_at = ? WHERE deliverable_id = ?`).run(value.format, value.quantity, value.revision_allowance, timestamp(), outputId);
        db.prepare(`UPDATE output_version SET title = ?, updated_at = ? WHERE deliverable_id = ? AND revision = ?`).run(value.title, timestamp(), outputId, existing.revision);
        event(projectId, "output_planned", value.title, outputId, existing.revision);
        return outputId;
      }).immediate();
    },

    confirmScope(id: string, scopeRevision: number, acknowledged: boolean): void {
      db.transaction(() => {
        project(id);
        const options = settings(id);
        if (!acknowledged) throw new Error("Confirm that the client agreed this scope");
        if (options.scope_revision !== scopeRevision) throw new Error("Scope changed. Reload before recording confirmation.");
        if (!options.approver_name) throw new Error("Set the named approver first");
        const outputs = operations.listDeliverables(id);
        if (!outputs.length) throw new Error("Plan at least one output before confirming scope");
        const shootDates = operations.listShoots(id).map((item) => item.shoot_date).sort();
        if (shootDates[0] && outputs.some((item) => item.due_date && item.due_date < shootDates[0])) throw new Error("An output deadline precedes the shoot. Correct the planned dates first.");
        if (options.scope_confirmed_at) return;
        db.prepare(`UPDATE production_project SET scope_confirmed_at = ?, updated_at = ? WHERE project_id = ?`).run(timestamp(), timestamp(), id);
        event(id, "scope_confirmed", `Scope ${scopeRevision}; recorded by local operator`, null, null, options.approver_name);
        advance(id, "booked");
      }).immediate();
    },

    reopenScope(id: string): void {
      db.transaction(() => {
        project(id);
        const options = settings(id);
        if (!options.scope_confirmed_at) return;
        db.prepare(`UPDATE production_project SET scope_revision = scope_revision + 1, scope_confirmed_at = NULL, updated_at = ? WHERE project_id = ?`).run(timestamp(), id);
        event(id, "scope_reopened", "Existing output versions and decisions preserved");
      }).immediate();
    },

    startProduction(id: string): void {
      db.transaction(() => {
        project(id);
        if (!settings(id).scope_confirmed_at) throw new Error("Confirm the current scope before starting production");
        assertPaymentWorkGate(db, id, "production");
        if (["in_production", "post_production", "completed"].includes(project(id).status)) return;
        advance(id, "in_production");
        event(id, "production_started", "Production phase opened after the configured payment gates");
      }).immediate();
    },

    startPostProduction(id: string): void {
      db.transaction(() => {
        project(id);
        if (!settings(id).scope_confirmed_at) throw new Error("Confirm the current scope before starting post-production");
        if (operations.listShoots(id).length && !settings(id).shoot_completed_at) throw new Error("Record the planned shoot as completed before starting post-production");
        assertPaymentWorkGate(db, id, "production");
        assertPaymentWorkGate(db, id, "post_production");
        if (["post_production", "completed"].includes(project(id).status)) return;
        advance(id, "post_production");
        event(id, "post_production_started", "Editing phase opened after the configured payment gates");
      }).immediate();
    },

    completeShoot(id: string, acknowledged: boolean): void {
      db.transaction(() => {
        project(id);
        const options = settings(id);
        if (!acknowledged || !options.scope_confirmed_at) throw new Error("Confirm scope and acknowledge that production actually took place");
        if (!operations.listShoots(id).length) throw new Error("Schedule a shoot first");
        if (options.shoot_completed_at) return;
        assertPaymentWorkGate(db, id, "production");
        db.prepare(`UPDATE production_project SET shoot_completed_at = ?, updated_at = ? WHERE project_id = ?`).run(timestamp(), timestamp(), id);
        event(id, "shoot_completed", "Production completion recorded by operator");
        const postPaymentMissing = paymentPlan(id)?.milestones.some((item) => item.work_gate === "post_production" && !item.paid_at);
        advance(id, postPaymentMissing ? "in_production" : "post_production");
      }).immediate();
    },

    saveShoot(id: string, shootId: string | null, input: unknown): void {
      const value = shootInputSchema.parse(input);
      if (value.project_id !== id) throw new Error("Shoot must belong to this project");
      db.transaction(() => {
        const currentProject = project(id);
        const options = settings(id);
        const existing = shootId ? operations.listShoots(id).find((item) => item.id === recordId.parse(shootId)) : null;
        if (shootId && !existing) throw new Error("Shoot not found in this active project");
        if (existing && options.shoot_completed_at && existing.shoot_date !== value.shoot_date) throw new Error("The completed shoot date is preserved. Add a new shoot for additional production.");
        if (currentProject.end_date && value.shoot_date > currentProject.end_date) throw new Error("Shoot exceeds the target finish. Revise the project timeline first.");
        if (shootId) operations.updateShoot(shootId, value); else operations.createShoot(value);
        const materialChange = !existing || existing.shoot_date !== value.shoot_date || existing.location !== value.location || existing.location_tz !== value.location_tz || existing.call_time_local !== value.call_time_local;
        if (materialChange) {
          db.prepare(`UPDATE production_project SET scope_revision = scope_revision + 1, scope_confirmed_at = NULL, shoot_completed_at = CASE WHEN ? THEN NULL ELSE shoot_completed_at END, updated_at = ? WHERE project_id = ?`).run(shootId === null ? 1 : 0, timestamp(), id);
          const firstDate = operations.listShoots(id).map((item) => item.shoot_date).sort()[0];
          if (firstDate && firstDate !== currentProject.start_date) {
            const { client_id, title, status, end_date, location, budget_minor_units, budget_currency, notes } = currentProject;
            operations.updateProject(id, { client_id, title, status, start_date: firstDate, end_date, location, budget_minor_units, budget_currency, notes });
          }
        }
        event(id, shootId ? "shoot_updated" : "shoot_scheduled", materialChange ? "Schedule changed; scope confirmation reopened" : "Production notes updated");
      }).immediate();
    },

    submitReview(input: unknown): void {
      const value = reviewSubmissionSchema.parse(input);
      db.transaction(() => {
        const current = expected({ project_id: value.project_id, output_id: value.output_id, expected_revision: value.expected_revision, expected_link: value.expected_link, expected_scope_revision: value.expected_scope_revision });
        const options = settings(value.project_id);
        if (!options.scope_confirmed_at) throw new Error("Record agreement on the current project scope first");
        assertPaymentWorkGate(db, value.project_id, "production");
        assertPaymentWorkGate(db, value.project_id, "post_production");
        const alreadySubmitted = current.current.review_status !== "not_submitted";
        if (alreadySubmitted && !value.new_revision) throw new Error("This version is already submitted. Explicitly create a new revision for changed work.");
        if (!alreadySubmitted && value.new_revision) throw new Error("Submit this first version before creating another revision");
        const revision = current.revision + (value.new_revision ? 1 : 0);
        if (revision - 1 > current.revision_allowance && !value.extra_revision_agreed) throw new Error("This revision exceeds the allowance. Confirm that additional scope was agreed externally.");
        if (revision - 1 > current.revision_allowance) event(value.project_id, "additional_revision_reported", "Additional scope agreement reported by local operator; no payment collected", current.id, current.revision, options.approver_name);
        if (value.new_revision) {
          db.prepare(`INSERT INTO output_version (deliverable_id, revision, title, link, change_note, review_status, submitted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'awaiting_review', ?, ?, ?)`)
            .run(current.id, revision, current.title, value.link, value.change_note, timestamp(), timestamp(), timestamp());
        } else {
          db.prepare(`UPDATE output_version SET link = ?, change_note = ?, review_status = 'awaiting_review', submitted_at = ?, updated_at = ? WHERE deliverable_id = ? AND revision = ?`)
            .run(value.link, value.change_note, timestamp(), timestamp(), current.id, revision);
        }
        db.prepare(`UPDATE deliverable SET revision = ?, link = ?, review_status = 'awaiting_review', updated_at = ? WHERE id = ?`).run(revision, value.link, timestamp(), current.id);
        event(value.project_id, "review_submitted", value.change_note, current.id, revision);
        advance(value.project_id, "post_production");
      }).immediate();
    },

    recordDecision(input: unknown): void {
      const value = outputDecisionSchema.parse(input);
      db.transaction(() => {
        const current = expected({ project_id: value.project_id, output_id: value.output_id, expected_revision: value.expected_revision, expected_link: value.expected_link, expected_scope_revision: value.expected_scope_revision });
        const options = settings(value.project_id);
        const version = current.current;
        if (value.kind === "approve") {
          if (!options.approver_name || !options.scope_confirmed_at) throw new Error("Set the approver and confirm scope before recording approval");
          if (version.review_status === "approved") return;
          if (!version.submitted_at) throw new Error("Submit this exact version for review first");
          db.prepare(`UPDATE output_version SET review_status = 'approved', approved_at = ?, approved_by = ?, updated_at = ? WHERE deliverable_id = ? AND revision = ?`).run(timestamp(), options.approver_name, timestamp(), current.id, current.revision);
          db.prepare(`UPDATE deliverable SET review_status = 'approved', updated_at = ? WHERE id = ?`).run(timestamp(), current.id);
          event(value.project_id, "approval_recorded", "Client decision reported by local operator", current.id, current.revision, options.approver_name);
        } else if (value.kind === "changes") {
          if (!version.submitted_at || version.delivered_at || version.review_status === "approved") throw new Error("Use Undo or a correction request for an already approved version");
          db.prepare(`UPDATE output_version SET review_status = 'changes_requested', feedback = ?, updated_at = ? WHERE deliverable_id = ? AND revision = ?`).run(value.details, timestamp(), current.id, current.revision);
          db.prepare(`UPDATE deliverable SET review_status = 'changes_requested', updated_at = ? WHERE id = ?`).run(timestamp(), current.id);
          event(value.project_id, "changes_requested", value.details, current.id, current.revision, options.approver_name);
        } else if (value.kind === "undo") {
          if (version.delivered_at) throw new Error("Delivery is already recorded. Request an approval correction instead.");
          if (version.review_status !== "approved") throw new Error("This version has no approval to withdraw");
          db.prepare(`UPDATE output_version SET review_status = 'awaiting_review', approved_at = NULL, approved_by = NULL, updated_at = ? WHERE deliverable_id = ? AND revision = ?`).run(timestamp(), current.id, current.revision);
          db.prepare(`UPDATE deliverable SET review_status = 'awaiting_review', updated_at = ? WHERE id = ?`).run(timestamp(), current.id);
          event(value.project_id, "approval_withdrawn", value.details || "Clicked accidentally", current.id, current.revision, version.approved_by || options.approver_name);
        } else if (value.kind === "deliver") {
          assertPaymentWorkGate(db, value.project_id, "delivery");
          if (version.review_status !== "approved") throw new Error("This exact output version must be approved before delivery");
          if (version.delivered_at) return;
          db.prepare(`UPDATE output_version SET delivered_at = ?, updated_at = ? WHERE deliverable_id = ? AND revision = ?`).run(timestamp(), timestamp(), current.id, current.revision);
          event(value.project_id, "output_delivered", "External handover recorded; no payment status changed", current.id, current.revision);
        } else {
          if (!version.delivered_at) throw new Error("Use Undo approval before delivery");
          event(value.project_id, "approval_correction_requested", value.details, current.id, current.revision, version.approved_by || options.approver_name);
        }
      }).immediate();
    },

    wrapProject(id: string): void {
      db.transaction(() => {
        project(id);
        const items = operations.listDeliverables(id).map((item) => output(id, item.id));
        if (!settings(id).scope_confirmed_at || !items.length || items.some((item) => !item.current.delivered_at)) throw new Error("Deliver every agreed active output before wrapping the project");
        if (project(id).status === "completed") return;
        advance(id, "post_production");
        advance(id, "completed");
        event(id, "project_wrapped", "All active output versions delivered; external payments remain separate");
      }).immediate();
    },

    restoreRecord(id: string, kind: string, restoredId: string): void {
      const acceptedKind = z.enum(["output", "shoot", "task"]).parse(kind);
      recordId.parse(restoredId);
      const table = { output: "deliverable", shoot: "shoot", task: "task" }[acceptedKind];
      db.transaction(() => {
        project(id);
        const row = db.prepare(`SELECT id, archived_at FROM ${table} WHERE id = ? AND project_id = ?`).get(restoredId, id) as { id: string; archived_at: string | null } | undefined;
        if (!row) throw new Error("Archived record not found in this project");
        if (!row.archived_at) return;
        db.prepare(`UPDATE ${table} SET archived_at = NULL, updated_at = ? WHERE id = ? AND project_id = ?`).run(timestamp(), restoredId, id);
        event(id, "record_restored", `${acceptedKind} restored individually; version history retained`);
      }).immediate();
    },
  };
}

export type ProductionRepository = ReturnType<typeof createProductionRepository>;
