import { z } from "zod";

/**
 * Client input schemas, derived from docs/data-model.md §1.1 (`client`).
 *
 * - Only user-writable fields are accepted.
 * - Server-managed fields (`id`, `created_at`, `updated_at`, `archived_at`)
 *   are excluded; unknown fields are rejected (strict objects).
 * - `email` is validated, never coerced (a malformed value is a rejection,
 *   not a fix); lowercasing happens on save.
 * - `country` is validated as ISO-3166-1 alpha-2; uppercasing happens on save.
 * - `phone` is validated against a permissive E.164 pattern.
 */

const emailSchema = z.email();

const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "phone must be a valid E.164 value");

const countrySchema = z
  .string()
  .regex(/^[A-Za-z]{2}$/, "country must be an ISO-3166-1 alpha-2 code");

const kindSchema = z.enum(["person", "organization"]);

export const createClientSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, "name must be a non-empty string")
    .max(200, "name must be at most 200 characters"),
  kind: kindSchema.default("organization"),
  preferred_contact_name: z
    .string()
    .trim()
    .max(200, "preferred_contact_name must be at most 200 characters")
    .optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address_line1: z
    .string()
    .trim()
    .max(200, "address_line1 must be at most 200 characters")
    .optional(),
  address_line2: z
    .string()
    .trim()
    .max(200, "address_line2 must be at most 200 characters")
    .optional(),
  city: z.string().trim().max(100, "city must be at most 100 characters").optional(),
  region: z
    .string()
    .trim()
    .max(100, "region must be at most 100 characters")
    .optional(),
  postal_code: z
    .string()
    .trim()
    .max(20, "postal_code must be at most 20 characters")
    .optional(),
  country: countrySchema.optional(),
  notes: z
    .string()
    .trim()
    .max(5000, "notes must be at most 5000 characters")
    .optional(),
});

export const updateClientSchema = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(1, "name must be a non-empty string")
      .max(200, "name must be at most 200 characters")
      .optional(),
    kind: kindSchema.optional(),
    preferred_contact_name: z
      .string()
      .trim()
      .max(200, "preferred_contact_name must be at most 200 characters")
      .nullable()
      .optional(),
    email: emailSchema.nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    address_line1: z
      .string()
      .trim()
      .max(200, "address_line1 must be at most 200 characters")
      .nullable()
      .optional(),
    address_line2: z
      .string()
      .trim()
      .max(200, "address_line2 must be at most 200 characters")
      .nullable()
      .optional(),
    city: z
      .string()
      .trim()
      .max(100, "city must be at most 100 characters")
      .nullable()
      .optional(),
    region: z
      .string()
      .trim()
      .max(100, "region must be at most 100 characters")
      .nullable()
      .optional(),
    postal_code: z
      .string()
      .trim()
      .max(20, "postal_code must be at most 20 characters")
      .nullable()
      .optional(),
    country: countrySchema.nullable().optional(),
    notes: z
      .string()
      .trim()
      .max(5000, "notes must be at most 5000 characters")
      .nullable()
      .optional(),
  })
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    { message: "At least one field must be provided" },
  );

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// ─── Client record schema (full database row) ────────────────────────────────

const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const rfc3339UtcRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * Validates a full `client` row as stored in SQLite.
 *
 * - `id` is a ULID (Crockford base-32, 26 chars).
 * - `created_at`, `updated_at` are RFC-3339 UTC strings.
 * - Nullable columns validate as `null` (not `undefined`) when absent.
 */
export const clientRecordSchema = z.strictObject({
  id: z.string().regex(ulidRegex, "id must be a valid ULID"),
  name: z.string().min(1).max(200),
  kind: z.enum(["person", "organization"]),
  preferred_contact_name: z.string().max(200).nullable(),
  email: z.email().nullable(),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/).nullable(),
  address_line1: z.string().max(200).nullable(),
  address_line2: z.string().max(200).nullable(),
  city: z.string().max(100).nullable(),
  region: z.string().max(100).nullable(),
  postal_code: z.string().max(20).nullable(),
  country: z.string().regex(/^[A-Za-z]{2}$/).nullable(),
  notes: z.string().max(5000).nullable(),
  created_at: z.string().regex(rfc3339UtcRegex, "created_at must be RFC-3339 UTC"),
  updated_at: z.string().regex(rfc3339UtcRegex, "updated_at must be RFC-3339 UTC"),
  archived_at: z.string().regex(rfc3339UtcRegex, "archived_at must be RFC-3339 UTC").nullable(),
});

export type Client = z.infer<typeof clientRecordSchema>;
