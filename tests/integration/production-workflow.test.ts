import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openMigratedDatabase } from "../../src/lib/db/application";
import { runPendingMigrations } from "../../src/lib/db/migrations";
import { createClientRepository } from "../../src/lib/clients/repository";
import { createOperationsRepository } from "../../src/lib/operations/repository";
import { createProductionRepository } from "../../src/lib/production/repository";

const MIGRATIONS = path.resolve("src/lib/db/migrations");
const NOW = new Date("2026-10-11T10:00:00.000Z");

describe("persistent production workflow", () => {
  let directory: string;
  let db: Database.Database;
  let repository: ReturnType<typeof createProductionRepository>;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "clckd-production-"));
    db = openMigratedDatabase({ dbPath: path.join(directory, "app.db"), migrationsDir: MIGRATIONS });
    repository = createProductionRepository(db, { now: () => NOW });
  });
  afterEach(() => { if (db.open) db.close(); fs.rmSync(directory, { recursive: true, force: true }); });

  function setup(rounds = 2) {
    return { client_id: null, new_client_name: "Fictional Glasshouse", title: "A quiet morning", production_type: "film", approver_name: "Riley Taylor", shoot_date: "2026-10-19", target_date: "2026-10-27", location: "Paris", location_tz: "Europe/Paris", notes: "Fictional test production", outputs: [
      { title: "Main film", type: "final_master", format: "4K · 16:9", quantity: 1, revision_allowance: rounds, due_date: "2026-10-27" },
      { title: "Social cuts", type: "social_cutdown", format: "1080p · 9:16", quantity: 3, revision_allowance: rounds, due_date: "2026-10-27" },
    ] };
  }
  function create(rounds = 2) {
    const id = repository.createProduction(setup(rounds));
    repository.confirmScope(id, 1, true);
    repository.completeShoot(id, true);
    return id;
  }
  function selected(id: string, index = 0) { const workspace = repository.getWorkspace(id)!; return workspace.outputs.find((item) => item.title === (index === 0 ? "Main film" : "Social cuts"))!; }
  function expected(id: string, index = 0) { const item = selected(id, index); return { project_id: id, output_id: item.id, expected_revision: item.revision, expected_link: item.current.link, expected_scope_revision: item.scope_revision }; }
  function submit(id: string, index = 0, newer = false, extra = false) { repository.submitReview({ ...expected(id, index), link: `https://example.com/${index}/v${selected(id, index).revision + (newer ? 1 : 0)}`, new_revision: newer, change_note: newer ? "Shortened the opening" : null, extra_revision_agreed: extra }); }
  function decide(id: string, kind: "approve" | "changes" | "undo" | "deliver" | "correction", index = 0) { repository.recordDecision({ ...expected(id, index), kind, confirmed: true, details: ["changes", "correction"].includes(kind) ? "Please check the opening" : null }); }

  it("creates project, client, outputs, shoot and tasks atomically and reopens the persisted work", () => {
    const id = create();
    submit(id); decide(id, "approve");
    db.close();
    db = openMigratedDatabase({ dbPath: path.join(directory, "app.db"), migrationsDir: MIGRATIONS });
    const reopened = createProductionRepository(db).getWorkspace(id)!;
    expect(reopened.settings).toMatchObject({ production_type: "film", approver_name: "Riley Taylor", scope_revision: 1 });
    expect(reopened.outputs.find((item) => item.title === "Main film")).toMatchObject({ format: "4K · 16:9", quantity: 1, current: { review_status: "approved" } });
    expect(reopened.shoots).toHaveLength(1);
    expect(reopened.tasks).toHaveLength(3);
    expect(reopened.events.some((item) => item.kind === "approval_recorded")).toBe(true);
  });

  it("rolls back every created entity if an output insert fails", () => {
    const conflicting = createProductionRepository(db, { generateId: () => "01ARZ3NDEKTSV4RRFFQ69G5FAV" });
    expect(() => conflicting.createProduction(setup())).toThrow();
    for (const table of ["project", "client", "deliverable", "production_project", "production_event"]) {
      expect((db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count).toBe(0);
    }
  });

  it("requires explicit, current scope confirmation and rejects conflicting dates", () => {
    const value = setup(); value.outputs[0].due_date = "2026-10-01";
    const id = repository.createProduction(value);
    expect(() => repository.confirmScope(id, 1, false)).toThrow("Confirm");
    expect(() => repository.confirmScope(id, 2, true)).toThrow("Scope changed");
    expect(() => repository.confirmScope(id, 1, true)).toThrow("precedes");
    expect(repository.getWorkspace(id)?.settings.scope_confirmed_at).toBeNull();
  });

  it("keeps approvals independent and ignores repeated approval of the same version", () => {
    const id = create(); submit(id); submit(id, 1); decide(id, "approve"); decide(id, "approve");
    expect(selected(id).current.review_status).toBe("approved");
    expect(selected(id, 1).current.review_status).toBe("awaiting_review");
    expect(repository.getWorkspace(id)?.events.filter((item) => item.kind === "approval_recorded")).toHaveLength(1);
  });

  it("requires deliberate acknowledgment before recording approval", () => {
    const id = create(); submit(id);
    expect(() => repository.recordDecision({ ...expected(id), kind: "approve", confirmed: false, details: null })).toThrow();
    expect(selected(id).current.review_status).toBe("awaiting_review");
  });

  it("preserves the reported approver and rejects decisions from stale scope forms", () => {
    const id = create(); submit(id); const stale = expected(id); decide(id, "approve");
    repository.updateSettings(id, { production_type: "film", approver_name: "Casey Lane" });
    expect(selected(id).current.approved_by).toBe("Riley Taylor");
    repository.confirmScope(id, 2, true);
    expect(() => repository.recordDecision({ ...stale, kind: "undo", confirmed: true, details: null })).toThrow("scope changed");
  });

  it("rejects stale approval after a new revision and preserves the earlier decision", () => {
    const id = create(); submit(id); decide(id, "approve");
    const stale = expected(id);
    submit(id, 0, true);
    expect(() => repository.recordDecision({ ...stale, kind: "approve", confirmed: true, details: null })).toThrow("changed");
    expect(selected(id).revision).toBe(2);
    expect(selected(id).current.review_status).toBe("awaiting_review");
    expect(selected(id).versions.find((item) => item.revision === 1)?.review_status).toBe("approved");
  });

  it("requires an explicit new revision, change note and extra-scope acknowledgment", () => {
    const id = create(0); submit(id);
    expect(() => submit(id)).toThrow("already submitted");
    expect(() => repository.submitReview({ ...expected(id), link: "https://example.com/v2", new_revision: true, change_note: null })).toThrow();
    expect(() => submit(id, 0, true)).toThrow("exceeds");
    submit(id, 0, true, true);
    expect(selected(id).revision).toBe(2);
  });

  it("withdraws approval before delivery while retaining both events", () => {
    const id = create(); submit(id); decide(id, "approve"); decide(id, "undo");
    expect(selected(id).current.review_status).toBe("awaiting_review");
    expect(repository.getWorkspace(id)?.events.map((item) => item.kind)).toEqual(expect.arrayContaining(["approval_recorded", "approval_withdrawn"]));
    expect(() => decide(id, "deliver")).toThrow("approved");
  });

  it("protects submitted version content and append-only decision events", () => {
    const id = create(); submit(id); decide(id, "approve");
    expect(() => db.prepare(`UPDATE output_version SET link = ? WHERE deliverable_id = ?`).run("https://example.com/replaced", selected(id).id)).toThrow("immutable");
    expect(() => db.prepare(`UPDATE production_event SET details = 'rewritten' WHERE project_id = ?`).run(id)).toThrow("append-only");
    expect(() => db.prepare(`DELETE FROM production_event WHERE project_id = ?`).run(id)).toThrow("append-only");
  });

  it("reopens scope for a rescheduled shoot and preserves completed shoot dates", () => {
    const id = repository.createProduction(setup()); repository.confirmScope(id, 1, true);
    const shoot = repository.getWorkspace(id)!.shoots[0];
    repository.saveShoot(id, shoot.id, { project_id: id, shoot_date: "2026-10-20", call_time_local: null, location_tz: "Europe/Paris", location: "Paris", crew_notes: null });
    expect(repository.getWorkspace(id)?.settings).toMatchObject({ scope_revision: 2, scope_confirmed_at: null });
    expect(repository.getWorkspace(id)?.project.start_date).toBe("2026-10-20");
    repository.confirmScope(id, 2, true); repository.completeShoot(id, true);
    expect(() => repository.saveShoot(id, shoot.id, { project_id: id, shoot_date: "2026-10-21", call_time_local: null, location_tz: "Europe/Paris", location: "Paris", crew_notes: null })).toThrow("completed shoot date");
  });

  it("records post-delivery corrections without recalling work or erasing approval", () => {
    const id = create(); submit(id); decide(id, "approve"); decide(id, "deliver");
    expect(() => decide(id, "undo")).toThrow("already recorded");
    decide(id, "correction");
    expect(selected(id).current).toMatchObject({ review_status: "approved", delivered_at: NOW.toISOString() });
    expect(repository.getWorkspace(id)?.events.some((item) => item.kind === "approval_correction_requested")).toBe(true);
  });

  it("does not complete the project after partial delivery or alter payment records", () => {
    const id = create(); submit(id); decide(id, "approve"); decide(id, "deliver"); decide(id, "deliver");
    expect(() => repository.wrapProject(id)).toThrow("every agreed");
    expect(repository.getWorkspace(id)?.project.status).toBe("post_production");
    submit(id, 1); decide(id, "approve", 1); decide(id, "deliver", 1); repository.wrapProject(id);
    expect(repository.getWorkspace(id)?.project.status).toBe("completed");
    expect((db.prepare(`SELECT count(*) AS count FROM invoice`).get() as { count: number }).count).toBe(0);
    expect(repository.getWorkspace(id)?.events.filter((item) => item.kind === "output_delivered")).toHaveLength(2);
  });

  it("preserves prior delivery when a new revision reopens a completed project", () => {
    const id = create();
    for (const index of [0, 1]) { submit(id, index); decide(id, "approve", index); decide(id, "deliver", index); }
    repository.wrapProject(id); submit(id, 0, true);
    expect(repository.getWorkspace(id)?.project.status).toBe("post_production");
    expect(selected(id).versions.find((item) => item.revision === 1)?.delivered_at).toBe(NOW.toISOString());
    expect(selected(id).current.delivered_at).toBeNull();
    expect(selected(id, 1).current.delivered_at).toBe(NOW.toISOString());
  });

  it("rejects output IDs belonging to another project and archived writes", () => {
    const first = create(); const second = create(); submit(first);
    expect(() => repository.recordDecision({ ...expected(first), project_id: second, kind: "approve", confirmed: true, details: null })).toThrow("not found");
    createOperationsRepository(db).archiveProject(first);
    expect(() => repository.reopenScope(first)).toThrow("Restore");
  });

  it("restores children individually without losing output versions or decisions", () => {
    const id = create(); submit(id); decide(id, "approve"); const outputId = selected(id).id;
    const operations = createOperationsRepository(db); operations.archiveProject(id); operations.unarchiveProject(id);
    expect(repository.getWorkspace(id)?.outputs).toHaveLength(0);
    expect(repository.getWorkspace(id)?.archivedOutputs).toHaveLength(2);
    repository.restoreRecord(id, "output", outputId);
    expect(repository.getWorkspace(id)?.outputs).toHaveLength(1);
    expect(repository.getWorkspace(id)?.outputs[0].current.review_status).toBe("approved");
    expect(repository.getWorkspace(id)?.archivedOutputs).toHaveLength(1);
  });

  it("migrates existing revision and approval status without fabricated client decisions", () => {
    db.close();
    const initial = path.join(directory, "initial"); fs.mkdirSync(initial);
    for (const suffix of ["up", "down"]) fs.copyFileSync(path.join(MIGRATIONS, `0001_initial.${suffix}.sql`), path.join(initial, `0001_initial.${suffix}.sql`));
    db = openMigratedDatabase({ dbPath: path.join(directory, "legacy.db"), migrationsDir: initial });
    const client = createClientRepository(db).createClient({ name: "Legacy test client", kind: "organization" });
    const operations = createOperationsRepository(db);
    const previous = operations.createProject({ client_id: client.id, title: "Existing work", status: "booked", start_date: null, end_date: null, location: null, budget_minor_units: null, budget_currency: null, notes: null });
    operations.createDeliverable({ project_id: previous.id, title: "Existing master", type: "final_master", due_date: null, review_status: "approved", revision: 7, link: "https://example.com/existing", notes: null });
    runPendingMigrations(db, MIGRATIONS);
    const workspace = createProductionRepository(db).getWorkspace(previous.id)!;
    expect(workspace.outputs[0]).toMatchObject({ title: "Existing master", revision: 7, current: { review_status: "approved", approved_at: null, delivered_at: null } });
    expect(workspace.settings.approver_name).toBeNull();
    expect(workspace.events).toHaveLength(0);
  });
});
