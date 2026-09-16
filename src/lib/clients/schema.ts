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
    city: z
      .string()
      .trim()
      .max(100, "city must be at most 100 characters")
      .optional(),
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
  })
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    { message: "At least one field must be provided" },
  );

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
