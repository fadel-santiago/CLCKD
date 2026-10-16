import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClientRepository } from "../../src/lib/clients/repository";
import { openMigratedDatabase } from "../../src/lib/db/application";
import { createOperationsRepository } from "../../src/lib/operations/repository";

const NOW = new Date("2026-09-23T12:00:00.000Z");
const MIGRATIONS_DIR = path.resolve(process.cwd(), "src/lib/db/migrations");

describe("operations repository", () => {
  let directory: string;
  let db: Database.Database;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "clckd-operations-"));
    db = openMigratedDatabase({
      dbPath: path.join(directory, "app.db"),
      migrationsDir: MIGRATIONS_DIR,
      now: () => NOW,
    });
    db.prepare(
      `INSERT INTO kv_meta (key, value, updated_at) VALUES (?, ?, ?), (?, ?, ?)`,
    ).run(
      "default_timezone",
      JSON.stringify("Europe/Paris"),
      NOW.toISOString(),
      "upcoming_shoots_window_days",
      JSON.stringify(14),
      NOW.toISOString(),
    );
  });

  afterEach(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function createClient(name = "Northlight Films") {
    return createClientRepository(db, { now: () => NOW }).createClient({
      name,
      kind: "organization",
      country: "FR",
    });
  }

  function createProject(status: "lead" | "proposed" | "booked" = "booked") {
    const client = createClient();
    const repository = createOperationsRepository(db, { now: () => NOW });
    const project = repository.createProject({
      client_id: client.id,
      title: "Autumn Campaign",
      status,
      start_date: "2026-09-24",
      end_date: "2026-10-02",
      location: "Paris",
      budget_minor_units: 450000,
      budget_currency: "EUR",
      notes: "Two-day branded production",
    });
    return { client, project, repository };
  }

  it("creates, lists, reads, and updates a project linked to an active client", () => {
    const { project, repository } = createProject("proposed");

    expect(repository.listProjects()).toMatchObject([
      { id: project.id, client_name: "Northlight Films", status: "proposed" },
    ]);
    expect(repository.getProject(project.id)?.title).toBe("Autumn Campaign");

    const updated = repository.updateProject(project.id, {
      client_id: project.client_id,
      title: "Autumn Campaign — Paris",
      status: "booked",
      start_date: project.start_date,
      end_date: project.end_date,
      location: project.location,
      budget_minor_units: project.budget_minor_units,
      budget_currency: project.budget_currency,
      notes: project.notes,
    });

    expect(updated).toMatchObject({ title: "Autumn Campaign — Paris", status: "booked" });
  });

  it("rejects impossible project status jumps", () => {
    const { project, repository } = createProject("lead");

    expect(() => repository.updateProject(project.id, {
      client_id: project.client_id,
      title: project.title,
      status: "completed",
      start_date: project.start_date,
      end_date: project.end_date,
      location: project.location,
      budget_minor_units: project.budget_minor_units,
      budget_currency: project.budget_currency,
      notes: project.notes,
    })).toThrow("Project cannot move from lead to completed");
  });

  it("feeds real shoots, overdue tasks, review work, and invoices into the dashboard", () => {
    const { project, repository } = createProject();

    const shoot = repository.createShoot({
      project_id: project.id,
      shoot_date: "2026-09-25",
      call_time_local: "07:30",
      location_tz: "Europe/Paris",
      location: "Canal Saint-Martin",
      crew_notes: "Load batteries the night before",
    });
    const task = repository.createTask({
      project_id: project.id,
      title: "Confirm release forms",
      description: null,
      priority: "urgent",
      due_date: "2026-09-22",
      status: "todo",
    });
    const deliverable = repository.createDeliverable({
      project_id: project.id,
      type: "rough_cut",
      title: "Client review cut",
      due_date: "2026-09-28",
      review_status: "awaiting_review",
      revision: 1,
      link: "https://example.com/review",
      notes: null,
    });
    const invoice = repository.createInvoice({
      project_id: project.id,
      reference: "INV-2026-001",
      amount_minor_units: 180000,
      currency: "EUR",
      invoice_status: "sent",
      payment_status: "unpaid",
      payment_due_date: "2026-09-20",
      date_issued: "2026-09-01",
      notes: null,
    });

    const dashboard = repository.getDashboard();
    expect(dashboard).toMatchObject({ today: "2026-09-23", upcomingWindowDays: 14 });
    expect(dashboard.activeProjects.map((item) => item.id)).toContain(project.id);
    expect(dashboard.upcomingShoots).toMatchObject([
      { id: shoot.id, project_title: project.title, equipment_total: 0 },
    ]);
    expect(dashboard.overdueTasks.map((item) => item.id)).toContain(task.id);
    expect(dashboard.reviewQueue.map((item) => item.id)).toContain(deliverable.id);
    expect(dashboard.moneyDue).toMatchObject([
      { id: invoice.id, payment_status: "overdue", client_name: "Northlight Films" },
    ]);
  });

  it("removes completed tasks and approved deliverables from attention queues", () => {
    const { project, repository } = createProject();
    const task = repository.createTask({
      project_id: project.id,
      title: "Back up rushes",
      description: null,
      priority: "high",
      due_date: "2026-09-20",
      status: "todo",
    });
    const deliverable = repository.createDeliverable({
      project_id: project.id,
      type: "final_master",
      title: "Launch master",
      due_date: "2026-09-22",
      review_status: "changes_requested",
      revision: 2,
      link: null,
      notes: null,
    });

    expect(repository.getDashboard().overdueTasks).toHaveLength(1);
    expect(repository.getDashboard().reviewQueue).toHaveLength(1);

    repository.updateTask(task.id, {
      project_id: project.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      due_date: task.due_date,
      status: "done",
    });
    repository.updateDeliverable(deliverable.id, {
      project_id: project.id,
      type: deliverable.type,
      title: deliverable.title,
      due_date: deliverable.due_date,
      review_status: "in_review",
      revision: deliverable.revision,
      link: deliverable.link,
      notes: deliverable.notes,
    });
    repository.updateDeliverable(deliverable.id, {
      project_id: project.id,
      type: deliverable.type,
      title: deliverable.title,
      due_date: deliverable.due_date,
      review_status: "approved",
      revision: deliverable.revision,
      link: deliverable.link,
      notes: deliverable.notes,
    });

    expect(repository.getDashboard().overdueTasks).toHaveLength(0);
    expect(repository.getDashboard().reviewQueue).toHaveLength(0);
  });

  it("stores one quote per non-lead project and updates it in place", () => {
    const { project, repository } = createProject("proposed");

    const first = repository.upsertQuote({
      project_id: project.id,
      amount_minor_units: 320000,
      currency: "EUR",
      valid_until: "2026-10-01",
      notes: "Includes one feedback round",
    });
    const updated = repository.upsertQuote({
      project_id: project.id,
      amount_minor_units: 350000,
      currency: "EUR",
      valid_until: "2026-10-05",
      notes: null,
    });

    expect(first.project_id).toBe(project.id);
    expect(updated.amount_minor_units).toBe(350000);
    expect(repository.getQuote(project.id)).toEqual(updated);
    expect(db.prepare(`SELECT COUNT(*) AS count FROM quote`).get()).toEqual({ count: 1 });
  });

  it("archives a project and its operational records while keeping restore explicit", () => {
    const { project, repository } = createProject();
    const task = repository.createTask({
      project_id: project.id,
      title: "Call venue",
      description: null,
      priority: "normal",
      due_date: "2026-09-20",
      status: "todo",
    });

    repository.archiveProject(project.id);

    expect(repository.listProjects()).toHaveLength(0);
    expect(repository.getDashboard().activeProjects).toHaveLength(0);
    expect(repository.getDashboard().overdueTasks).toHaveLength(0);
    expect(db.prepare(`SELECT archived_at FROM task WHERE id = ?`).get(task.id))
      .toEqual({ archived_at: NOW.toISOString() });

    repository.unarchiveProject(project.id);
    expect(repository.listProjects()).toHaveLength(1);
    expect(repository.listTasks(project.id)).toHaveLength(0);
  });
});
