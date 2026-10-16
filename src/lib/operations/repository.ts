import type Database from "better-sqlite3";
import { ulid } from "ulid";
import { addCalendarDays, todayInTimeZone } from "./dates";
import { assertPaymentWorkGate } from "../production/payments";
import {
  deliverableInputSchema,
  deliverableRecordSchema,
  invoiceInputSchema,
  invoiceRecordSchema,
  projectInputSchema,
  projectRecordSchema,
  quoteInputSchema,
  quoteRecordSchema,
  shootInputSchema,
  shootRecordSchema,
  taskInputSchema,
  taskRecordSchema,
  type Deliverable,
  type Invoice,
  type Project,
  type Quote,
  type Shoot,
  type Task,
} from "./schema";

export interface ProjectWithClient extends Project {
  client_name: string;
}

export interface DashboardProject {
  id: string;
  title: string;
  status: Project["status"];
  client_name: string;
  next_date: string | null;
}

export interface DashboardShoot extends Shoot {
  project_title: string;
  client_name: string;
  equipment_total: number;
  equipment_checked: number;
}

export interface DashboardTask extends Task {
  project_title: string;
  client_name: string;
}

export interface DashboardDeliverable extends Deliverable {
  project_title: string;
  client_name: string;
}

export interface DashboardInvoice extends Invoice {
  project_title: string;
  client_name: string;
}

export interface DashboardData {
  today: string;
  upcomingWindowDays: number;
  activeProjects: DashboardProject[];
  upcomingShoots: DashboardShoot[];
  overdueTasks: DashboardTask[];
  reviewQueue: DashboardDeliverable[];
  moneyDue: DashboardInvoice[];
}

export interface OperationsRepository {
  listProjects(options?: { includeArchived?: boolean; clientId?: string }): ProjectWithClient[];
  getProject(id: string): ProjectWithClient | null;
  createProject(input: unknown): ProjectWithClient;
  updateProject(id: string, input: unknown): ProjectWithClient | null;
  archiveProject(id: string): ProjectWithClient | null;
  unarchiveProject(id: string): ProjectWithClient | null;
  listShoots(projectId: string): Shoot[];
  createShoot(input: unknown): Shoot;
  updateShoot(id: string, input: unknown): Shoot | null;
  listTasks(projectId: string): Task[];
  createTask(input: unknown): Task;
  updateTask(id: string, input: unknown): Task | null;
  listDeliverables(projectId: string): Deliverable[];
  createDeliverable(input: unknown): Deliverable;
  updateDeliverable(id: string, input: unknown): Deliverable | null;
  listInvoices(projectId: string): Invoice[];
  createInvoice(input: unknown): Invoice;
  updateInvoice(id: string, input: unknown): Invoice | null;
  getQuote(projectId: string): Quote | null;
  upsertQuote(input: unknown): Quote;
  getDashboard(): DashboardData;
}

const PROJECT_TRANSITIONS: Record<Project["status"], readonly Project["status"][]> = {
  lead: ["lead", "proposed", "on_hold"],
  proposed: ["proposed", "booked", "lead", "on_hold"],
  booked: ["booked", "in_production", "proposed", "on_hold"],
  in_production: ["in_production", "post_production", "booked", "on_hold"],
  post_production: ["post_production", "completed", "in_production", "on_hold"],
  completed: ["completed", "in_production"],
  on_hold: ["on_hold", "lead", "proposed", "booked", "in_production", "post_production"],
};

const TASK_TRANSITIONS: Record<Task["status"], readonly Task["status"][]> = {
  todo: ["todo", "in_progress", "blocked", "done"],
  in_progress: ["in_progress", "todo", "blocked", "done"],
  blocked: ["blocked", "todo", "in_progress", "done"],
  done: ["done", "in_progress"],
};

const REVIEW_TRANSITIONS: Record<Deliverable["review_status"], readonly Deliverable["review_status"][]> = {
  not_submitted: ["not_submitted", "awaiting_review", "in_review", "approved"],
  awaiting_review: ["awaiting_review", "in_review", "approved", "changes_requested"],
  in_review: ["in_review", "awaiting_review", "approved", "changes_requested"],
  changes_requested: ["changes_requested", "awaiting_review", "in_review"],
  approved: ["approved", "in_review"],
};

const INVOICE_TRANSITIONS: Record<Invoice["invoice_status"], readonly Invoice["invoice_status"][]> = {
  draft: ["draft", "sent", "void"],
  sent: ["sent", "paid", "void"],
  paid: ["paid"],
  void: ["void"],
};

function assertTransition<T extends string>(
  allowed: Record<T, readonly T[]>,
  from: T,
  to: T,
  label: string,
): void {
  if (!allowed[from].includes(to)) {
    throw new Error(`${label} cannot move from ${from} to ${to}`);
  }
}

function normalizeRow(row: unknown): Record<string, unknown> {
  if (typeof row !== "object" || row === null) {
    throw new Error("Database returned an invalid record");
  }
  return row as Record<string, unknown>;
}

function parseJsonSetting(value: string | undefined, fallback: string | number): string | number {
  if (value === undefined) {
    return fallback;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" || typeof parsed === "number" ? parsed : fallback;
  } catch {
    return value;
  }
}

export function createOperationsRepository(
  db: Database.Database,
  dependencies: { generateId?: () => string; now?: () => Date } = {},
): OperationsRepository {
  const generateId = dependencies.generateId ?? (() => ulid());
  const now = dependencies.now ?? (() => new Date());

  const readProject = (recordId: string): ProjectWithClient | null => {
    const row = db
      .prepare(
        `SELECT p.*, c.name AS client_name
         FROM project p
         JOIN client c ON c.id = p.client_id
         WHERE p.id = ?`,
      )
      .get(recordId);
    if (row === undefined) {
      return null;
    }
    const values = normalizeRow(row);
    const clientName = String(values.client_name);
    delete values.client_name;
    return { ...projectRecordSchema.parse(values), client_name: clientName };
  };

  const assertActiveProject = (projectId: string): void => {
    const row = db
      .prepare(`SELECT id FROM project WHERE id = ? AND archived_at IS NULL`)
      .get(projectId);
    if (row === undefined) {
      throw new Error("Choose an active project");
    }
  };

  const refreshOverdueInvoices = (): void => {
    const settings = db
      .prepare(`SELECT key, value FROM kv_meta WHERE key IN ('default_timezone')`)
      .all() as Array<{ key: string; value: string }>;
    const zoneValue = settings.find((row) => row.key === "default_timezone")?.value;
    const timeZone = String(parseJsonSetting(zoneValue, "UTC"));
    const today = todayInTimeZone(timeZone, now());
    const timestamp = now().toISOString();
    db.prepare(
      `UPDATE invoice
       SET payment_status = CASE
         WHEN invoice_status = 'sent' AND payment_due_date IS NOT NULL
              AND payment_due_date < ? AND payment_status IN ('unpaid', 'overdue')
           THEN 'overdue'
         WHEN payment_status = 'overdue' THEN 'unpaid'
         ELSE payment_status
       END,
       updated_at = CASE
         WHEN payment_status != CASE
           WHEN invoice_status = 'sent' AND payment_due_date IS NOT NULL
                AND payment_due_date < ? AND payment_status IN ('unpaid', 'overdue')
             THEN 'overdue'
           WHEN payment_status = 'overdue' THEN 'unpaid'
           ELSE payment_status
         END THEN ? ELSE updated_at END
       WHERE payment_status IN ('unpaid', 'overdue')`,
    ).run(today, today, timestamp);
  };

  return {
    listProjects(options = {}): ProjectWithClient[] {
      const filters: string[] = [];
      const parameters: unknown[] = [];
      if (!options.includeArchived) {
        filters.push("p.archived_at IS NULL");
      }
      if (options.clientId !== undefined) {
        filters.push("p.client_id = ?");
        parameters.push(options.clientId);
      }
      const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = db
        .prepare(
          `SELECT p.*, c.name AS client_name
           FROM project p JOIN client c ON c.id = p.client_id
           ${where}
           ORDER BY CASE p.status
             WHEN 'in_production' THEN 1 WHEN 'post_production' THEN 2
             WHEN 'booked' THEN 3 WHEN 'proposed' THEN 4 WHEN 'lead' THEN 5
             WHEN 'on_hold' THEN 6 ELSE 7 END,
             COALESCE(p.start_date, p.end_date, '9999-12-31'), p.updated_at DESC`,
        )
        .all(...parameters);
      return rows.map((row) => {
        const values = normalizeRow(row);
        const clientName = String(values.client_name);
        delete values.client_name;
        return { ...projectRecordSchema.parse(values), client_name: clientName };
      });
    },

    getProject(recordId: string): ProjectWithClient | null {
      return readProject(recordId);
    },

    createProject(input: unknown): ProjectWithClient {
      const value = projectInputSchema.parse(input);
      const activeClient = db
        .prepare(`SELECT id FROM client WHERE id = ? AND archived_at IS NULL`)
        .get(value.client_id);
      if (activeClient === undefined) {
        throw new Error("Choose an active client");
      }
      const recordId = generateId();
      const timestamp = now().toISOString();
      db.prepare(
        `INSERT INTO project (
          id, client_id, title, status, start_date, end_date, location,
          budget_minor_units, budget_currency, notes, created_at, updated_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(
        recordId,
        value.client_id,
        value.title,
        value.status,
        value.start_date,
        value.end_date,
        value.location,
        value.budget_minor_units,
        value.budget_currency,
        value.notes,
        timestamp,
        timestamp,
      );
      const stored = readProject(recordId);
      if (stored === null) throw new Error("Project could not be created");
      return stored;
    },

    updateProject(recordId: string, input: unknown): ProjectWithClient | null {
      const existing = readProject(recordId);
      if (existing === null) return null;
      const value = projectInputSchema.parse(input);
      assertTransition(PROJECT_TRANSITIONS, existing.status, value.status, "Project");
      if (value.status !== existing.status && ["in_production", "post_production", "completed"].includes(value.status)) {
        assertPaymentWorkGate(db, recordId, "production");
        if (value.status !== "in_production") assertPaymentWorkGate(db, recordId, "post_production");
        if (value.status === "completed") assertPaymentWorkGate(db, recordId, "delivery");
      }
      if (value.status === "completed" && existing.status !== "completed" &&
          db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'output_version'`).get()) {
        const pending = db.prepare(`SELECT count(*) AS count FROM deliverable d
          LEFT JOIN output_version v ON v.deliverable_id = d.id AND v.revision = d.revision
          WHERE d.project_id = ? AND d.archived_at IS NULL AND v.delivered_at IS NULL`).get(recordId) as { count: number };
        if (pending.count > 0) throw new Error("Deliver all active output versions before completing this project");
      }
      const activeClient = db
        .prepare(`SELECT id FROM client WHERE id = ? AND archived_at IS NULL`)
        .get(value.client_id);
      if (activeClient === undefined) throw new Error("Choose an active client");
      db.prepare(
        `UPDATE project SET client_id = ?, title = ?, status = ?, start_date = ?,
         end_date = ?, location = ?, budget_minor_units = ?, budget_currency = ?,
         notes = ?, updated_at = ? WHERE id = ?`,
      ).run(
        value.client_id,
        value.title,
        value.status,
        value.start_date,
        value.end_date,
        value.location,
        value.budget_minor_units,
        value.budget_currency,
        value.notes,
        now().toISOString(),
        recordId,
      );
      return readProject(recordId);
    },

    archiveProject(recordId: string): ProjectWithClient | null {
      const existing = readProject(recordId);
      if (existing === null || existing.archived_at !== null) return existing;
      const timestamp = now().toISOString();
      db.transaction(() => {
        db.prepare(`UPDATE project SET archived_at = ?, updated_at = ? WHERE id = ?`)
          .run(timestamp, timestamp, recordId);
        for (const table of ["shoot", "task", "deliverable", "invoice"] as const) {
          db.prepare(`UPDATE ${table} SET archived_at = ?, updated_at = ? WHERE project_id = ?`)
            .run(timestamp, timestamp, recordId);
        }
      })();
      return readProject(recordId);
    },

    unarchiveProject(recordId: string): ProjectWithClient | null {
      const existing = readProject(recordId);
      if (existing === null || existing.archived_at === null) return existing;
      db.prepare(`UPDATE project SET archived_at = NULL, updated_at = ? WHERE id = ?`)
        .run(now().toISOString(), recordId);
      return readProject(recordId);
    },

    listShoots(projectId: string): Shoot[] {
      return (db
        .prepare(`SELECT * FROM shoot WHERE project_id = ? AND archived_at IS NULL ORDER BY shoot_date, call_time_local`)
        .all(projectId) as unknown[]).map((row) => shootRecordSchema.parse(row));
    },

    createShoot(input: unknown): Shoot {
      const value = shootInputSchema.parse(input);
      assertActiveProject(value.project_id);
      const recordId = generateId();
      const timestamp = now().toISOString();
      db.prepare(
        `INSERT INTO shoot (id, project_id, shoot_date, call_time_local, location_tz,
         location, crew_notes, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(recordId, value.project_id, value.shoot_date, value.call_time_local, value.location_tz,
        value.location, value.crew_notes, timestamp, timestamp);
      return shootRecordSchema.parse(db.prepare(`SELECT * FROM shoot WHERE id = ?`).get(recordId));
    },

    updateShoot(recordId: string, input: unknown): Shoot | null {
      const existing = db.prepare(`SELECT * FROM shoot WHERE id = ?`).get(recordId);
      if (existing === undefined) return null;
      const value = shootInputSchema.parse(input);
      assertActiveProject(value.project_id);
      db.prepare(
        `UPDATE shoot SET project_id = ?, shoot_date = ?, call_time_local = ?, location_tz = ?,
         location = ?, crew_notes = ?, updated_at = ? WHERE id = ?`,
      ).run(value.project_id, value.shoot_date, value.call_time_local, value.location_tz,
        value.location, value.crew_notes, now().toISOString(), recordId);
      return shootRecordSchema.parse(db.prepare(`SELECT * FROM shoot WHERE id = ?`).get(recordId));
    },

    listTasks(projectId: string): Task[] {
      return (db
        .prepare(`SELECT * FROM task WHERE project_id = ? AND archived_at IS NULL ORDER BY status = 'done', due_date IS NULL, due_date, CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END`)
        .all(projectId) as unknown[]).map((row) => taskRecordSchema.parse(row));
    },

    createTask(input: unknown): Task {
      const value = taskInputSchema.parse(input);
      assertActiveProject(value.project_id);
      const recordId = generateId();
      const timestamp = now().toISOString();
      db.prepare(
        `INSERT INTO task (id, project_id, title, description, priority, due_date, status,
         created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(recordId, value.project_id, value.title, value.description, value.priority,
        value.due_date, value.status, timestamp, timestamp);
      return taskRecordSchema.parse(db.prepare(`SELECT * FROM task WHERE id = ?`).get(recordId));
    },

    updateTask(recordId: string, input: unknown): Task | null {
      const existingRow = db.prepare(`SELECT * FROM task WHERE id = ?`).get(recordId);
      if (existingRow === undefined) return null;
      const existing = taskRecordSchema.parse(existingRow);
      const value = taskInputSchema.parse(input);
      assertTransition(TASK_TRANSITIONS, existing.status, value.status, "Task");
      assertActiveProject(value.project_id);
      db.prepare(
        `UPDATE task SET project_id = ?, title = ?, description = ?, priority = ?, due_date = ?,
         status = ?, updated_at = ? WHERE id = ?`,
      ).run(value.project_id, value.title, value.description, value.priority, value.due_date,
        value.status, now().toISOString(), recordId);
      return taskRecordSchema.parse(db.prepare(`SELECT * FROM task WHERE id = ?`).get(recordId));
    },

    listDeliverables(projectId: string): Deliverable[] {
      return (db
        .prepare(`SELECT * FROM deliverable WHERE project_id = ? AND archived_at IS NULL ORDER BY review_status = 'approved', due_date IS NULL, due_date, title`)
        .all(projectId) as unknown[]).map((row) => deliverableRecordSchema.parse(row));
    },

    createDeliverable(input: unknown): Deliverable {
      const value = deliverableInputSchema.parse(input);
      assertActiveProject(value.project_id);
      const recordId = generateId();
      const timestamp = now().toISOString();
      db.prepare(
        `INSERT INTO deliverable (id, project_id, type, title, due_date, review_status,
         revision, link, notes, created_at, updated_at, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(recordId, value.project_id, value.type, value.title, value.due_date,
        value.review_status, value.revision, value.link, value.notes, timestamp, timestamp);
      return deliverableRecordSchema.parse(db.prepare(`SELECT * FROM deliverable WHERE id = ?`).get(recordId));
    },

    updateDeliverable(recordId: string, input: unknown): Deliverable | null {
      const existingRow = db.prepare(`SELECT * FROM deliverable WHERE id = ?`).get(recordId);
      if (existingRow === undefined) return null;
      const existing = deliverableRecordSchema.parse(existingRow);
      const value = deliverableInputSchema.parse(input);
      assertTransition(REVIEW_TRANSITIONS, existing.review_status, value.review_status, "Deliverable");
      assertActiveProject(value.project_id);
      db.prepare(
        `UPDATE deliverable SET project_id = ?, type = ?, title = ?, due_date = ?,
         review_status = ?, revision = ?, link = ?, notes = ?, updated_at = ? WHERE id = ?`,
      ).run(value.project_id, value.type, value.title, value.due_date, value.review_status,
        value.revision, value.link, value.notes, now().toISOString(), recordId);
      return deliverableRecordSchema.parse(db.prepare(`SELECT * FROM deliverable WHERE id = ?`).get(recordId));
    },

    listInvoices(projectId: string): Invoice[] {
      refreshOverdueInvoices();
      return (db
        .prepare(`SELECT * FROM invoice WHERE project_id = ? AND archived_at IS NULL ORDER BY payment_status = 'paid', payment_due_date IS NULL, payment_due_date, created_at DESC`)
        .all(projectId) as unknown[]).map((row) => invoiceRecordSchema.parse(row));
    },

    createInvoice(input: unknown): Invoice {
      const value = invoiceInputSchema.parse(input);
      assertActiveProject(value.project_id);
      const recordId = generateId();
      const timestamp = now().toISOString();
      db.prepare(
        `INSERT INTO invoice (id, project_id, reference, amount_minor_units, currency,
         invoice_status, payment_status, payment_due_date, date_issued, notes,
         created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(recordId, value.project_id, value.reference, value.amount_minor_units, value.currency,
        value.invoice_status, value.payment_status, value.payment_due_date, value.date_issued,
        value.notes, timestamp, timestamp);
      refreshOverdueInvoices();
      return invoiceRecordSchema.parse(db.prepare(`SELECT * FROM invoice WHERE id = ?`).get(recordId));
    },

    updateInvoice(recordId: string, input: unknown): Invoice | null {
      const existingRow = db.prepare(`SELECT * FROM invoice WHERE id = ?`).get(recordId);
      if (existingRow === undefined) return null;
      const existing = invoiceRecordSchema.parse(existingRow);
      const value = invoiceInputSchema.parse(input);
      assertTransition(INVOICE_TRANSITIONS, existing.invoice_status, value.invoice_status, "Invoice");
      assertActiveProject(value.project_id);
      db.prepare(
        `UPDATE invoice SET project_id = ?, reference = ?, amount_minor_units = ?, currency = ?,
         invoice_status = ?, payment_status = ?, payment_due_date = ?, date_issued = ?, notes = ?,
         updated_at = ? WHERE id = ?`,
      ).run(value.project_id, value.reference, value.amount_minor_units, value.currency,
        value.invoice_status, value.payment_status, value.payment_due_date, value.date_issued,
        value.notes, now().toISOString(), recordId);
      refreshOverdueInvoices();
      return invoiceRecordSchema.parse(db.prepare(`SELECT * FROM invoice WHERE id = ?`).get(recordId));
    },

    getQuote(projectId: string): Quote | null {
      const row = db.prepare(`SELECT * FROM quote WHERE project_id = ?`).get(projectId);
      return row === undefined ? null : quoteRecordSchema.parse(row);
    },

    upsertQuote(input: unknown): Quote {
      const value = quoteInputSchema.parse(input);
      assertActiveProject(value.project_id);
      const timestamp = now().toISOString();
      db.prepare(
        `INSERT INTO quote (project_id, amount_minor_units, currency, valid_until, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET amount_minor_units = excluded.amount_minor_units,
         currency = excluded.currency, valid_until = excluded.valid_until, notes = excluded.notes,
         updated_at = excluded.updated_at`,
      ).run(value.project_id, value.amount_minor_units, value.currency, value.valid_until,
        value.notes, timestamp, timestamp);
      return quoteRecordSchema.parse(db.prepare(`SELECT * FROM quote WHERE project_id = ?`).get(value.project_id));
    },

    getDashboard(): DashboardData {
      refreshOverdueInvoices();
      const settingRows = db
        .prepare(`SELECT key, value FROM kv_meta WHERE key IN ('default_timezone', 'upcoming_shoots_window_days')`)
        .all() as Array<{ key: string; value: string }>;
      const timezoneValue = settingRows.find((row) => row.key === "default_timezone")?.value;
      const windowValue = settingRows.find((row) => row.key === "upcoming_shoots_window_days")?.value;
      const timeZone = String(parseJsonSetting(timezoneValue, "UTC"));
      const parsedWindow = Number(parseJsonSetting(windowValue, 14));
      const upcomingWindowDays = Number.isInteger(parsedWindow) && parsedWindow >= 1 && parsedWindow <= 90 ? parsedWindow : 14;
      const today = todayInTimeZone(timeZone, now());
      const windowEnd = addCalendarDays(today, upcomingWindowDays);

      const activeProjects = db.prepare(
        `SELECT p.id, p.title, p.status, c.name AS client_name,
          COALESCE(
            (SELECT MIN(s.shoot_date) FROM shoot s
             WHERE s.project_id = p.id AND s.archived_at IS NULL AND s.shoot_date >= ?),
            CASE WHEN p.start_date >= ? THEN p.start_date ELSE NULL END,
            CASE WHEN p.end_date >= ? THEN p.end_date ELSE NULL END
          ) AS next_date
         FROM project p JOIN client c ON c.id = p.client_id
         WHERE p.archived_at IS NULL AND c.archived_at IS NULL AND p.status != 'completed'
         ORDER BY CASE p.status WHEN 'in_production' THEN 1 WHEN 'post_production' THEN 2
           WHEN 'booked' THEN 3 WHEN 'proposed' THEN 4 WHEN 'lead' THEN 5 ELSE 6 END,
           next_date IS NULL, next_date, p.updated_at DESC LIMIT 8`,
      ).all(today, today, today) as DashboardProject[];

      const upcomingShoots = (db.prepare(
        `SELECT s.*, p.title AS project_title, c.name AS client_name,
          COUNT(e.id) AS equipment_total,
          COALESCE(SUM(e.checked), 0) AS equipment_checked
         FROM shoot s
         JOIN project p ON p.id = s.project_id
         JOIN client c ON c.id = p.client_id
         LEFT JOIN shoot_equipment_item e ON e.shoot_id = s.id
         WHERE s.archived_at IS NULL AND p.archived_at IS NULL AND c.archived_at IS NULL
           AND p.status != 'completed' AND s.shoot_date >= ? AND s.shoot_date <= ?
         GROUP BY s.id ORDER BY s.shoot_date, s.call_time_local LIMIT 8`,
      ).all(today, windowEnd) as Array<Record<string, unknown>>).map((row) => {
        const projectTitle = String(row.project_title);
        const clientName = String(row.client_name);
        const equipmentTotal = Number(row.equipment_total);
        const equipmentChecked = Number(row.equipment_checked);
        delete row.project_title;
        delete row.client_name;
        delete row.equipment_total;
        delete row.equipment_checked;
        return { ...shootRecordSchema.parse(row), project_title: projectTitle, client_name: clientName,
          equipment_total: equipmentTotal, equipment_checked: equipmentChecked };
      });

      const overdueTasks = (db.prepare(
        `SELECT t.*, p.title AS project_title, c.name AS client_name
         FROM task t JOIN project p ON p.id = t.project_id JOIN client c ON c.id = p.client_id
         WHERE t.archived_at IS NULL AND p.archived_at IS NULL AND c.archived_at IS NULL
           AND t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < ?
         ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
           t.due_date LIMIT 10`,
      ).all(today) as Array<Record<string, unknown>>).map((row) => {
        const projectTitle = String(row.project_title);
        const clientName = String(row.client_name);
        delete row.project_title;
        delete row.client_name;
        return { ...taskRecordSchema.parse(row), project_title: projectTitle, client_name: clientName };
      });

      const reviewQueue = (db.prepare(
        `SELECT d.*, p.title AS project_title, c.name AS client_name
         FROM deliverable d JOIN project p ON p.id = d.project_id JOIN client c ON c.id = p.client_id
         WHERE d.archived_at IS NULL AND p.archived_at IS NULL AND c.archived_at IS NULL
           AND d.review_status IN ('awaiting_review', 'in_review', 'changes_requested')
         ORDER BY d.review_status = 'changes_requested' DESC, d.due_date IS NULL, d.due_date LIMIT 10`,
      ).all() as Array<Record<string, unknown>>).map((row) => {
        const projectTitle = String(row.project_title);
        const clientName = String(row.client_name);
        delete row.project_title;
        delete row.client_name;
        return { ...deliverableRecordSchema.parse(row), project_title: projectTitle, client_name: clientName };
      });

      const moneyDue = (db.prepare(
        `SELECT i.*, p.title AS project_title, c.name AS client_name
         FROM invoice i JOIN project p ON p.id = i.project_id JOIN client c ON c.id = p.client_id
         WHERE i.archived_at IS NULL AND p.archived_at IS NULL AND c.archived_at IS NULL
           AND i.invoice_status = 'sent' AND i.payment_status IN ('unpaid', 'partial', 'overdue')
         ORDER BY i.payment_status = 'overdue' DESC, i.payment_due_date IS NULL, i.payment_due_date LIMIT 10`,
      ).all() as Array<Record<string, unknown>>).map((row) => {
        const projectTitle = String(row.project_title);
        const clientName = String(row.client_name);
        delete row.project_title;
        delete row.client_name;
        return { ...invoiceRecordSchema.parse(row), project_title: projectTitle, client_name: clientName };
      });

      return { today, upcomingWindowDays, activeProjects, upcomingShoots, overdueTasks, reviewQueue, moneyDue };
    },
  };
}
