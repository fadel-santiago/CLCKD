import { z } from "zod";
import { isValidIsoDate, isValidTimeZone, LOCAL_TIME_RE } from "./dates";
import { isSupportedCurrency } from "./money";

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const RFC3339_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const id = z.string().regex(ULID_RE, "Invalid record identifier");
const timestamp = z.string().regex(RFC3339_UTC_RE);
const nullableTimestamp = timestamp.nullable();
const optionalDate = z
  .string()
  .refine(isValidIsoDate, "Use a valid date in YYYY-MM-DD format")
  .nullable();
const requiredDate = z
  .string()
  .refine(isValidIsoDate, "Use a valid date in YYYY-MM-DD format");
const currency = z
  .string()
  .transform((value) => value.toUpperCase())
  .refine(isSupportedCurrency, "Choose a supported currency");

export const projectStatuses = [
  "lead",
  "proposed",
  "booked",
  "in_production",
  "post_production",
  "completed",
  "on_hold",
] as const;

export const taskPriorities = ["low", "normal", "high", "urgent"] as const;
export const taskStatuses = ["todo", "in_progress", "blocked", "done"] as const;
export const deliverableTypes = [
  "edit_master",
  "color_grade",
  "rough_cut",
  "final_master",
  "thumbnail",
  "stills",
  "audio_master",
  "social_cutdown",
  "other",
] as const;
export const reviewStatuses = [
  "not_submitted",
  "awaiting_review",
  "in_review",
  "approved",
  "changes_requested",
] as const;
export const invoiceStatuses = ["draft", "sent", "paid", "void"] as const;
export const paymentStatuses = ["unpaid", "partial", "paid", "overdue"] as const;
export const userPaymentStatuses = ["unpaid", "partial", "paid"] as const;

export const projectInputSchema = z
  .strictObject({
    client_id: id,
    title: z.string().trim().min(1, "Project title is required").max(200),
    status: z.enum(projectStatuses).default("lead"),
    start_date: optionalDate,
    end_date: optionalDate,
    location: z.string().trim().max(300).nullable(),
    budget_minor_units: z.number().int().min(0).max(1_000_000_000_000_000).nullable(),
    budget_currency: currency.nullable(),
    notes: z.string().trim().max(5000).nullable(),
  })
  .superRefine((value, context) => {
    if ((value.budget_minor_units === null) !== (value.budget_currency === null)) {
      context.addIssue({
        code: "custom",
        path: ["budget_minor_units"],
        message: "Budget amount and currency must be supplied together",
      });
    }
    if (
      value.start_date !== null &&
      value.end_date !== null &&
      value.end_date < value.start_date
    ) {
      context.addIssue({
        code: "custom",
        path: ["end_date"],
        message: "End date cannot be before the start date",
      });
    }
  });

export const projectRecordSchema = z.strictObject({
  id,
  client_id: id,
  title: z.string().min(1).max(200),
  status: z.enum(projectStatuses),
  start_date: optionalDate,
  end_date: optionalDate,
  location: z.string().max(300).nullable(),
  budget_minor_units: z.number().int().min(0).nullable(),
  budget_currency: currency.nullable(),
  notes: z.string().max(5000).nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  archived_at: nullableTimestamp,
});

export const shootInputSchema = z.strictObject({
  project_id: id,
  shoot_date: requiredDate,
  call_time_local: z
    .string()
    .regex(LOCAL_TIME_RE, "Use 24-hour time in HH:MM format")
    .nullable(),
  location_tz: z
    .string()
    .trim()
    .refine(isValidTimeZone, "Use a valid IANA timezone"),
  location: z.string().trim().min(1, "Location is required").max(300),
  crew_notes: z.string().trim().max(5000).nullable(),
});

export const shootRecordSchema = z.strictObject({
  id,
  project_id: id,
  shoot_date: requiredDate,
  call_time_local: z.string().regex(LOCAL_TIME_RE).nullable(),
  location_tz: z.string().refine(isValidTimeZone),
  location: z.string().min(1).max(300),
  crew_notes: z.string().max(5000).nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  archived_at: nullableTimestamp,
});

export const taskInputSchema = z.strictObject({
  project_id: id,
  title: z.string().trim().min(1, "Task title is required").max(200),
  description: z.string().trim().max(5000).nullable(),
  priority: z.enum(taskPriorities).default("normal"),
  due_date: optionalDate,
  status: z.enum(taskStatuses).default("todo"),
});

export const taskRecordSchema = z.strictObject({
  id,
  project_id: id,
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable(),
  priority: z.enum(taskPriorities),
  due_date: optionalDate,
  status: z.enum(taskStatuses),
  created_at: timestamp,
  updated_at: timestamp,
  archived_at: nullableTimestamp,
});

export const deliverableInputSchema = z.strictObject({
  project_id: id,
  type: z.enum(deliverableTypes),
  title: z.string().trim().min(1, "Deliverable title is required").max(200),
  due_date: optionalDate,
  review_status: z.enum(reviewStatuses).default("not_submitted"),
  revision: z.number().int().min(1).default(1),
  link: z.string().url("Use a valid absolute URL").nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

export const deliverableRecordSchema = z.strictObject({
  id,
  project_id: id,
  type: z.enum(deliverableTypes),
  title: z.string().min(1).max(200),
  due_date: optionalDate,
  review_status: z.enum(reviewStatuses),
  revision: z.number().int().min(1),
  link: z.string().url().nullable(),
  notes: z.string().max(2000).nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  archived_at: nullableTimestamp,
});

export const invoiceInputSchema = z
  .strictObject({
    project_id: id,
    reference: z.string().trim().min(1, "Invoice reference is required").max(80),
    amount_minor_units: z.number().int().positive().max(1_000_000_000_000_000),
    currency,
    invoice_status: z.enum(invoiceStatuses).default("draft"),
    payment_status: z.enum(userPaymentStatuses).default("unpaid"),
    payment_due_date: optionalDate,
    date_issued: optionalDate,
    notes: z.string().trim().max(2000).nullable(),
  })
  .superRefine((value, context) => {
    if ((value.invoice_status === "paid") !== (value.payment_status === "paid")) {
      context.addIssue({
        code: "custom",
        path: ["payment_status"],
        message: "Invoice and payment status must both be paid",
      });
    }
    if (value.invoice_status === "void" && value.payment_status === "paid") {
      context.addIssue({
        code: "custom",
        path: ["payment_status"],
        message: "A void invoice cannot be paid",
      });
    }
  });

export const invoiceRecordSchema = z.strictObject({
  id,
  project_id: id,
  reference: z.string().min(1).max(80),
  amount_minor_units: z.number().int().positive(),
  currency,
  invoice_status: z.enum(invoiceStatuses),
  payment_status: z.enum(paymentStatuses),
  payment_due_date: optionalDate,
  date_issued: optionalDate,
  notes: z.string().max(2000).nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  archived_at: nullableTimestamp,
});

export const quoteInputSchema = z.strictObject({
  project_id: id,
  amount_minor_units: z.number().int().positive().max(1_000_000_000_000_000),
  currency,
  valid_until: optionalDate,
  notes: z.string().trim().max(2000).nullable(),
});

export const quoteRecordSchema = z.strictObject({
  project_id: id,
  amount_minor_units: z.number().int().positive(),
  currency,
  valid_until: optionalDate,
  notes: z.string().max(2000).nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type Project = z.infer<typeof projectRecordSchema>;
export type ShootInput = z.infer<typeof shootInputSchema>;
export type Shoot = z.infer<typeof shootRecordSchema>;
export type TaskInput = z.infer<typeof taskInputSchema>;
export type Task = z.infer<typeof taskRecordSchema>;
export type DeliverableInput = z.infer<typeof deliverableInputSchema>;
export type Deliverable = z.infer<typeof deliverableRecordSchema>;
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
export type Invoice = z.infer<typeof invoiceRecordSchema>;
export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type Quote = z.infer<typeof quoteRecordSchema>;
