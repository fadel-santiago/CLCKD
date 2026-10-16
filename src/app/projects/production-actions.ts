"use server";
import { requireOwnerAction } from "@/lib/access/server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getApplicationProductionRepository } from "@/lib/db/application";
import { recordId } from "@/lib/production/schema";

export type ProductionActionResult = { ok: boolean; message: string; redirectTo?: string };
const text = (form: FormData, key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
const optional = (form: FormData, key: string) => text(form, key) || null;
const numeric = (form: FormData, key: string) => Number(text(form, key));
function errorResult(error: unknown): ProductionActionResult {
  const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "The change could not be saved";
  return { ok: false, message: (message || "Check the form fields").slice(0, 300) };
}
function refresh(id: string): void {
  revalidatePath("/"); revalidatePath("/projects"); revalidatePath(`/projects/${id}`); revalidatePath("/clients");
}
function paymentInput(form: FormData) {
  const titles = form.getAll("milestone_title");
  const shares = form.getAll("milestone_percentage");
  const conditions = form.getAll("milestone_condition");
  const dates = form.getAll("milestone_due_date");
  const gates = form.getAll("milestone_work_gate");
  if (titles.length !== shares.length || titles.length !== conditions.length || titles.length !== dates.length || titles.length !== gates.length) throw new Error("Incomplete payment schedule");
  return { total: text(form, "payment_total"), currency: text(form, "payment_currency"), contract_reference: optional(form, "contract_reference"), terms: optional(form, "contract_terms"), milestones: titles.map((title, index) => ({ title, percentage: shares[index], payment_condition: conditions[index], due_date: dates[index] || null, work_gate: gates[index] })) };
}

export async function createProductionAction(form: FormData): Promise<ProductionActionResult> {
  await requireOwnerAction();
  try {
    const kind = text(form, "production_type");
    const due = optional(form, "target_date");
    const outputs = [{ title: text(form, "output_title"), type: kind === "photography" ? "stills" : "final_master", format: text(form, "format"), quantity: numeric(form, "quantity"), revision_allowance: numeric(form, "revision_allowance"), due_date: due }];
    if (form.has("extra_output")) outputs.push({ title: kind === "photography" ? "Proof selection" : "Social cut pack", type: kind === "photography" ? "stills" : "social_cutdown", format: kind === "photography" ? "Contact sheet / online selection" : "1080p · 9:16", quantity: kind === "photography" ? 1 : 3, revision_allowance: kind === "photography" ? 1 : numeric(form, "revision_allowance"), due_date: due });
    const id = getApplicationProductionRepository().createProduction({
      client_id: optional(form, "client_id"), new_client_name: optional(form, "client_id") ? null : optional(form, "new_client_name"),
      title: text(form, "title"), production_type: kind, approver_name: text(form, "approver_name"),
      shoot_date: optional(form, "shoot_date"), target_date: due, location: optional(form, "location"),
      location_tz: text(form, "location_tz") || "Europe/Paris", notes: optional(form, "notes"), outputs,
      payment_plan: text(form, "payment_enabled") === "yes" ? paymentInput(form) : null,
    });
    refresh(id);
    return { ok: true, message: "Project saved", redirectTo: `/projects/${id}` };
  } catch (error) { return errorResult(error); }
}

export async function productionAction(form: FormData): Promise<ProductionActionResult> {
  await requireOwnerAction();
  try {
    const id = recordId.parse(text(form, "project_id"));
    const repository = getApplicationProductionRepository();
    const intent = text(form, "intent");
    const expected = { project_id: id, output_id: text(form, "output_id"), expected_revision: numeric(form, "expected_revision"), expected_link: optional(form, "expected_link"), expected_scope_revision: numeric(form, "expected_scope_revision") };
    let message = "Change saved";
    if (intent === "payment_plan") {
      repository.savePaymentPlan(id, numeric(form, "expected_plan_revision"), paymentInput(form));
      message = "Payment agreement saved; record client scope confirmation again";
    } else if (intent === "milestone_payment") {
      repository.recordMilestonePayment(id, { milestone_id: text(form, "milestone_id"), expected_plan_revision: numeric(form, "expected_plan_revision"), kind: text(form, "payment_kind"), confirmed: form.has("confirmed"), reference: text(form, "reference") });
      message = "External payment record saved; no funds moved";
    } else if (intent === "settings") {
      repository.updateSettings(id, { production_type: text(form, "production_type"), approver_name: text(form, "approver_name"), ...(form.has("target_date") ? { target_date: optional(form, "target_date") } : {}), ...(form.has("notes") ? { notes: optional(form, "notes") } : {}) });
      message = "Project details saved; current scope needs confirmation";
    } else if (intent === "output") {
      repository.saveOutput(id, optional(form, "output_id"), { title: text(form, "title"), type: text(form, "type"), format: text(form, "format"), quantity: numeric(form, "quantity"), revision_allowance: numeric(form, "revision_allowance"), due_date: optional(form, "due_date") });
      message = "Output saved";
    } else if (intent === "scope") {
      repository.confirmScope(id, numeric(form, "scope_revision"), form.has("confirmed"));
      message = "Reported client scope confirmation recorded";
    } else if (intent === "reopen_scope") {
      repository.reopenScope(id); message = "Scope reopened; previous decisions preserved";
    } else if (intent === "start_production") {
      repository.startProduction(id); message = "Production phase started";
    } else if (intent === "start_post") {
      repository.startPostProduction(id); message = "Post-production phase started";
    } else if (intent === "shoot") {
      repository.completeShoot(id, form.has("confirmed")); message = "Production completion recorded";
    } else if (intent === "review") {
      repository.submitReview({ ...expected, link: text(form, "link"), new_revision: form.has("new_revision"), change_note: optional(form, "change_note"), extra_revision_agreed: form.has("extra_revision_agreed") });
      message = "Output version saved and marked awaiting review";
    } else if (intent === "decision") {
      repository.recordDecision({ ...expected, kind: text(form, "decision_kind"), confirmed: form.has("confirmed"), details: optional(form, "details") });
      message = "Decision recorded for this exact output version";
    } else if (intent === "restore_record") {
      repository.restoreRecord(id, text(form, "record_kind"), text(form, "record_id")); message = "Archived record restored; its history is preserved";
    } else if (intent === "wrap") {
      repository.wrapProject(id); message = "Project wrapped; all agreed outputs delivered";
    } else throw new Error("Unknown workflow action");
    refresh(id);
    return { ok: true, message };
  } catch (error) { return errorResult(error); }
}
