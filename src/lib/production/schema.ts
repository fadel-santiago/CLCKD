import { z } from "zod";
import { isValidIsoDate, isValidTimeZone } from "../operations/dates";
import { deliverableTypes } from "../operations/schema";
import { calculatePaymentPlan, paymentPlanInputSchema } from "./payments";

export const recordId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Invalid record identifier");
const date = z.string().refine(isValidIsoDate, "Use a valid calendar date");
const optionalDate = date.nullable();
const shortText = z.string().trim().min(1).max(200);
export const productionTypes = ["film", "photography", "event", "custom"] as const;

export const outputSetupSchema = z.strictObject({
  title: shortText,
  type: z.enum(deliverableTypes),
  format: shortText,
  quantity: z.number().int().min(1).max(999),
  revision_allowance: z.number().int().min(0).max(20),
  due_date: optionalDate,
});

export const productionSetupSchema = z.strictObject({
  client_id: recordId.nullable(),
  new_client_name: shortText.nullable(),
  title: shortText,
  production_type: z.enum(productionTypes),
  approver_name: shortText,
  shoot_date: optionalDate,
  target_date: optionalDate,
  location: z.string().trim().max(300).nullable(),
  location_tz: z.string().refine(isValidTimeZone, "Choose a valid IANA timezone"),
  notes: z.string().trim().max(5000).nullable(),
  outputs: z.array(outputSetupSchema).min(1).max(20),
  payment_plan: paymentPlanInputSchema.nullable().optional(),
}).superRefine((value, context) => {
  if (value.payment_plan) {
    try { calculatePaymentPlan(value.payment_plan); }
    catch (error) { context.addIssue({ code: "custom", path: ["payment_plan"], message: error instanceof Error ? error.message : "Check the payment plan" }); }
  }
  if ((value.client_id === null) === (value.new_client_name === null)) {
    context.addIssue({ code: "custom", path: ["client_id"], message: "Choose a client or enter a new client name" });
  }
  if (value.shoot_date && value.target_date && value.target_date < value.shoot_date) {
    context.addIssue({ code: "custom", path: ["target_date"], message: "Delivery deadline cannot precede the shoot" });
  }
});

export const expectedOutputSchema = z.strictObject({
  project_id: recordId,
  output_id: recordId,
  expected_revision: z.number().int().min(1),
  expected_link: z.string().nullable(),
  expected_scope_revision: z.number().int().min(1),
});
export const reviewSubmissionSchema = expectedOutputSchema.extend({
  link: z.string().trim().min(1).max(4000).transform((value) => {
    // Only normalize plausible bare web addresses, never arbitrary URI schemes.
    return !/^[a-z][a-z0-9+.-]*:/i.test(value) && /^[^\s/]+\.[^\s/]+(?:[/?#]|$)/.test(value) ? `https://${value}` : value;
  }).pipe(z.string().url().refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch { return false; }
  }, "Use an HTTPS review link (https://) without embedded credentials")),
  new_revision: z.boolean(),
  change_note: z.string().trim().max(2000).nullable(),
  extra_revision_agreed: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.new_revision && !value.change_note) {
    context.addIssue({ code: "custom", path: ["change_note"], message: "Describe what changed in the new revision" });
  }
});

export const decisionKinds = ["approve", "changes", "undo", "deliver", "correction"] as const;
export const outputDecisionSchema = expectedOutputSchema.extend({
  kind: z.enum(decisionKinds),
  confirmed: z.boolean(),
  details: z.string().trim().max(2000).nullable(),
}).superRefine((value, context) => {
  if (value.kind === "approve" && !value.confirmed) {
    context.addIssue({ code: "custom", path: ["confirmed"], message: "Confirm approval of this exact output version" });
  }
  if (["changes", "correction"].includes(value.kind) && !value.details) {
    context.addIssue({ code: "custom", path: ["details"], message: "Describe the requested change or correction" });
  }
});

export type OutputSetup = z.infer<typeof outputSetupSchema>;
export type ProductionSetup = z.infer<typeof productionSetupSchema>;
export type ExpectedOutput = z.infer<typeof expectedOutputSchema>;
