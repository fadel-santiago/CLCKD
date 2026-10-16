"use server";
import { requireOwnerAction } from "@/lib/access/server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getApplicationOperationsRepository, getApplicationProductionRepository } from "@/lib/db/application";
import { parseMoneyInput } from "@/lib/operations/money";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function optionalText(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return value.trim();
}

function positiveInteger(formData: FormData, name: string, fallback: number): number {
  const raw = optionalText(formData, name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive whole number`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").slice(0, 220);
  }
  return "The change could not be saved.";
}

function redirectWithError(path: string, error: unknown): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(errorMessage(error))}`);
}

function projectInput(formData: FormData) {
  const budgetAmount = optionalText(formData, "budget_amount");
  const budgetCurrency = optionalText(formData, "budget_currency");
  return {
    client_id: text(formData, "client_id"),
    title: text(formData, "title"),
    status: text(formData, "status"),
    start_date: optionalText(formData, "start_date"),
    end_date: optionalText(formData, "end_date"),
    location: optionalText(formData, "location"),
    budget_minor_units:
      budgetAmount === null || budgetCurrency === null
        ? null
        : parseMoneyInput(budgetAmount, budgetCurrency),
    budget_currency: budgetAmount === null ? null : budgetCurrency?.toUpperCase() ?? null,
    notes: optionalText(formData, "notes"),
  };
}

function revalidateProject(projectId: string): void {
  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/clients");
}

export async function createProjectAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  let projectId: string;
  try {
    projectId = getApplicationOperationsRepository().createProject(projectInput(formData)).id;
  } catch (error) {
    redirectWithError("/projects/new", error);
  }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}?notice=${encodeURIComponent("Project created")}`);
}

export async function updateProjectAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const projectId = text(formData, "id");
  try {
    const project = getApplicationOperationsRepository().updateProject(
      projectId,
      projectInput(formData),
    );
    if (project === null) throw new Error("Project not found");
  } catch (error) {
    redirectWithError(`/projects/${projectId}`, error);
  }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}?notice=${encodeURIComponent("Project updated")}`);
}

export async function archiveProjectAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const projectId = text(formData, "id");
  try {
    if (getApplicationOperationsRepository().archiveProject(projectId) === null) {
      throw new Error("Project not found");
    }
  } catch (error) {
    redirectWithError(`/projects/${projectId}`, error);
  }
  revalidateProject(projectId);
  redirect("/projects?notice=" + encodeURIComponent("Project archived"));
}

export async function unarchiveProjectAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const projectId = text(formData, "id");
  try {
    if (getApplicationOperationsRepository().unarchiveProject(projectId) === null) {
      throw new Error("Project not found");
    }
  } catch (error) {
    redirectWithError(`/projects/${projectId}`, error);
  }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}?notice=${encodeURIComponent("Project restored")}`);
}

export async function createShootAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const projectId = text(formData, "project_id");
  try {
    getApplicationProductionRepository().saveShoot(projectId, null, {
      project_id: projectId, shoot_date: text(formData, "shoot_date"),
      call_time_local: optionalText(formData, "call_time_local"),
      location_tz: text(formData, "location_tz"), location: text(formData, "location"),
      crew_notes: optionalText(formData, "crew_notes"),
    });
  } catch (error) { redirectWithError(`/projects/${projectId}?tab=shoot`, error); }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}?tab=shoot&notice=${encodeURIComponent("Shoot scheduled; scope confirmation reopened")}`);
}

export async function updateShootAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const projectId = text(formData, "project_id");
  try {
    getApplicationProductionRepository().saveShoot(projectId, text(formData, "id"), {
      project_id: projectId, shoot_date: text(formData, "shoot_date"),
      call_time_local: optionalText(formData, "call_time_local"),
      location_tz: text(formData, "location_tz"), location: text(formData, "location"),
      crew_notes: optionalText(formData, "crew_notes"),
    });
  } catch (error) { redirectWithError(`/projects/${projectId}?tab=shoot`, error); }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}?tab=shoot&notice=${encodeURIComponent("Shoot updated")}`);
}

export async function createTaskAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const projectId = text(formData, "project_id");
  try {
    getApplicationOperationsRepository().createTask({
      project_id: projectId,
      title: text(formData, "title"),
      description: optionalText(formData, "description"),
      priority: text(formData, "priority") || "normal",
      due_date: optionalText(formData, "due_date"),
      status: text(formData, "status") || "todo",
    });
  } catch (error) {
    redirectWithError(`/projects/${projectId}`, error);
  }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}?notice=${encodeURIComponent("Task added")}#tasks`);
}

export async function updateTaskAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const projectId = text(formData, "project_id");
  try {
    if (getApplicationOperationsRepository().updateTask(text(formData, "id"), {
      project_id: projectId,
      title: text(formData, "title"),
      description: optionalText(formData, "description"),
      priority: text(formData, "priority"),
      due_date: optionalText(formData, "due_date"),
      status: text(formData, "status"),
    }) === null) throw new Error("Task not found");
  } catch (error) {
    redirectWithError(`/projects/${projectId}`, error);
  }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}?notice=${encodeURIComponent("Task updated")}#tasks`);
}

export async function createDeliverableAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const projectId = text(formData, "project_id");
  try {
    if ((optionalText(formData, "review_status") ?? "not_submitted") !== "not_submitted" ||
        positiveInteger(formData, "revision", 1) !== 1 || optionalText(formData, "link")) {
      throw new Error("Use the explicit version controls to submit work or record decisions");
    }
    getApplicationProductionRepository().saveOutput(projectId, null, {
      title: text(formData, "title"), type: text(formData, "type"),
      format: optionalText(formData, "format") ?? "Specification to confirm",
      quantity: positiveInteger(formData, "quantity", 1),
      revision_allowance: 2, due_date: optionalText(formData, "due_date"),
    });
  } catch (error) { redirectWithError(`/projects/${projectId}`, error); }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}?tab=outputs&notice=${encodeURIComponent("Output planned")}`);
}

export async function updateDeliverableAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const projectId = text(formData, "project_id");
  try {
    const repository = getApplicationProductionRepository();
    const existing = repository.getWorkspace(projectId)?.outputs.find((item) => item.id === text(formData, "id"));
    if (!existing) throw new Error("Output not found in this project");
    if (text(formData, "review_status") !== existing.review_status ||
        positiveInteger(formData, "revision", 1) !== existing.revision ||
        optionalText(formData, "link") !== existing.current.link) {
      throw new Error("Use the version controls; existing decisions cannot be overwritten by this form");
    }
    repository.saveOutput(projectId, existing.id, {
      title: text(formData, "title"), type: text(formData, "type"),
      format: existing.format ?? "Specification to confirm",
      quantity: existing.quantity, revision_allowance: existing.revision_allowance,
      due_date: optionalText(formData, "due_date"),
    });
  } catch (error) { redirectWithError(`/projects/${projectId}`, error); }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}?tab=outputs&notice=${encodeURIComponent("Output updated")}`);
}

function invoiceInput(formData: FormData, projectId: string) {
  const currency = text(formData, "currency").toUpperCase();
  return {
    project_id: projectId,
    reference: text(formData, "reference"),
    amount_minor_units: parseMoneyInput(text(formData, "amount"), currency),
    currency,
    invoice_status: text(formData, "invoice_status"),
    payment_status: text(formData, "payment_status"),
    payment_due_date: optionalText(formData, "payment_due_date"),
    date_issued: optionalText(formData, "date_issued"),
    notes: optionalText(formData, "notes"),
  };
}

export async function createInvoiceAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const projectId = text(formData, "project_id");
  try {
    getApplicationOperationsRepository().createInvoice(invoiceInput(formData, projectId));
  } catch (error) {
    redirectWithError(`/projects/${projectId}`, error);
  }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}?notice=${encodeURIComponent("Invoice added")}#money`);
}

export async function updateInvoiceAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const projectId = text(formData, "project_id");
  try {
    if (getApplicationOperationsRepository().updateInvoice(
      text(formData, "id"),
      invoiceInput(formData, projectId),
    ) === null) throw new Error("Invoice not found");
  } catch (error) {
    redirectWithError(`/projects/${projectId}`, error);
  }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}?notice=${encodeURIComponent("Invoice updated")}#money`);
}

export async function upsertQuoteAction(formData: FormData): Promise<never> {
  await requireOwnerAction();
  const projectId = text(formData, "project_id");
  const currency = text(formData, "currency").toUpperCase();
  try {
    getApplicationOperationsRepository().upsertQuote({
      project_id: projectId,
      amount_minor_units: parseMoneyInput(text(formData, "amount"), currency),
      currency,
      valid_until: optionalText(formData, "valid_until"),
      notes: optionalText(formData, "notes"),
    });
  } catch (error) {
    redirectWithError(`/projects/${projectId}`, error);
  }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}?notice=${encodeURIComponent("Quote saved")}#money`);
}
