import { z } from "zod";
import type Database from "better-sqlite3";
import { isValidIsoDate } from "../operations/dates";
import { isSupportedCurrency, parseMoneyInput } from "../operations/money";

export const paymentMilestoneInputSchema = z.strictObject({
  title: z.string().trim().min(1, "Name each payment milestone").max(200),
  percentage: z.string().trim().regex(/^\d{1,3}(?:\.\d{1,2})?$/, "Use a percentage with at most two decimal places"),
  payment_condition: z.string().trim().min(1, "Describe when each payment is due").max(1000),
  due_date: z.string().refine(isValidIsoDate, "Use a valid milestone due date").nullable(),
  work_gate: z.enum(["none", "production", "post_production", "delivery"]).default("none"),
});
export const paymentPlanInputSchema = z.strictObject({
  total: z.string().trim().min(1, "Enter the project fee"),
  currency: z.string().refine(isSupportedCurrency, "Choose a supported currency"),
  contract_reference: z.string().trim().max(300).nullable(),
  terms: z.string().trim().max(5000).nullable(),
  milestones: z.array(paymentMilestoneInputSchema).min(1).max(20),
});
export type PaymentPlanInput = z.infer<typeof paymentPlanInputSchema>;
export function percentageBasisPoints(value: string): number {
  const [whole, decimals = ""] = value.split(".");
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
}

/** Integer allocation with largest remainders; the schedule always equals the fee. */
export function calculatePaymentPlan(input: unknown) {
  const value = paymentPlanInputSchema.parse(input);
  const total = parseMoneyInput(value.total, value.currency);
  if (total <= 0) throw new Error("Project fee must be greater than zero");
  const shares = value.milestones.map((item) => percentageBasisPoints(item.percentage));
  if (shares.some((share) => share <= 0 || share > 10000)) throw new Error("Each milestone must have a percentage greater than zero and no more than 100");
  if (shares.reduce((sum, share) => sum + share, 0) !== 10000) throw new Error("Payment percentages must total exactly 100%");
  const allocations = shares.map((share, index) => {
    const product = BigInt(total) * BigInt(share);
    return { index, amount: Number(product / BigInt(10000)), remainder: Number(product % BigInt(10000)) };
  });
  const left = total - allocations.reduce((sum, item) => sum + item.amount, 0);
  for (const item of [...allocations].sort((a, b) => b.remainder - a.remainder || a.index - b.index).slice(0, left)) item.amount += 1;
  if (allocations.some((item) => item.amount === 0)) throw new Error("Project fee is too small to allocate a positive amount to every milestone");
  return { ...value, total_minor_units: total, milestones: value.milestones.map((item, index) => ({ ...item, basis_points: shares[index], amount_minor_units: allocations[index].amount })) };
}

export interface PaymentMilestone {
  id: string; project_id: string; plan_revision: number; position: number; title: string; basis_points: number;
  amount_minor_units: number; payment_condition: string; due_date: string | null;
  paid_at: string | null; payment_reference: string | null;
  work_gate: "none" | "production" | "post_production" | "delivery";
}
export interface PaymentPlan {
  project_id: string; total_minor_units: number; currency: string;
  contract_reference: string | null; terms: string | null; revision: number;
  milestones: PaymentMilestone[];
}

export function assertPaymentWorkGate(db: Database.Database, projectId: string, stage: "production" | "post_production" | "delivery") {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'production_payment_milestone'").get()) return;
  const blocked = db.prepare(`SELECT title FROM production_payment_milestone WHERE project_id = ? AND plan_revision = (SELECT MAX(revision) FROM production_payment_plan WHERE project_id = ?) AND work_gate = ? AND paid_at IS NULL ORDER BY position`).all(projectId, projectId, stage) as { title: string }[];
  if (blocked.length) throw new Error(`Before ${stage.replaceAll("_", " ")}, record the externally received payment for: ${blocked.map((item) => item.title).join(", ")}. See Payments.`);
}
