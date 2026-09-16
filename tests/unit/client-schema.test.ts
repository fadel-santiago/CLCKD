import { describe, expect, it } from "vitest";

import {
  createClientSchema,
  updateClientSchema,
} from "@/lib/clients/schema";
import type { ZodError, ZodIssue } from "zod";

/**
 * Accepts an object built with a computed key so that the strict-object
 * input types are not defeated by a `string` index signature.
 */
function record(input: Record<string, unknown>): Record<string, unknown> {
  return input;
}

/**
 * Asserts that a strict-object rejection reports the given key as
 * unrecognized. In Zod 4 the `unrecognized_keys` issue carries the rejected
 * names in `issue.keys` (its path is empty), so we must not rely on `path`.
 */
function assertUnrecognizedKey(error: ZodError<unknown>, key: string): void {
  const issue: ZodIssue | undefined = error.issues.find(
    (candidate) => candidate.code === "unrecognized_keys",
  );
  expect(issue, "expected an unrecognized_keys issue").toBeDefined();
  if (issue !== undefined && issue.code === "unrecognized_keys") {
    expect(issue.keys).toContain(key);
  }
}

describe("createClientSchema", () => {
  it("accepts a valid minimal creation input", () => {
    const result = createClientSchema.safeParse({ name: "Acme Studio" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Acme Studio");
      expect(result.data.kind).toBe("organization");
    }
  });

  it("accepts a valid complete creation input", () => {
    const result = createClientSchema.safeParse({
      name: "Jane Doe",
      kind: "person",
      preferred_contact_name: "Jane",
      email: "jane@example.com",
      phone: "+33612345678",
      address_line1: "1 Rue de la Paix",
      address_line2: "Apt 4",
      city: "Paris",
      region: "Île-de-France",
      postal_code: "75002",
      country: "fr",
      notes: "Prefers afternoon calls.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe("person");
      expect(result.data.email).toBe("jane@example.com");
      expect(result.data.country).toBe("fr");
    }
  });

  it("trims whitespace from string fields", () => {
    const result = createClientSchema.safeParse({
      name: "  Padded Name  ",
      city: "  Lyon  ",
      notes: "  padded notes  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Padded Name");
      expect(result.data.city).toBe("Lyon");
      expect(result.data.notes).toBe("padded notes");
    }
  });

  it("rejects a missing name", () => {
    const result = createClientSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("name");
    }
  });

  it("rejects an empty name", () => {
    const result = createClientSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("name");
    }
  });

  it("rejects a whitespace-only name", () => {
    const result = createClientSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("name");
    }
  });

  it("rejects a name longer than 200 characters", () => {
    const result = createClientSchema.safeParse({
      name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("name");
    }
  });

  it("rejects an unknown kind value", () => {
    const result = createClientSchema.safeParse({
      name: "Acme",
      kind: "company",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("kind");
    }
  });

  it("rejects an invalid email when email is supplied", () => {
    const result = createClientSchema.safeParse({
      name: "Acme",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("email");
    }
  });

  it("rejects an invalid phone when phone is supplied", () => {
    const result = createClientSchema.safeParse({
      name: "Acme",
      phone: "0612345678",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("phone");
    }
  });

  it("rejects a country that is not ISO-3166-1 alpha-2", () => {
    const result = createClientSchema.safeParse({
      name: "Acme",
      country: "france",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("country");
    }
  });

  it("enforces the documented maximum lengths for optional fields", () => {
    const fields: ReadonlyArray<readonly [string, string]> = [
      ["preferred_contact_name", "a".repeat(201)],
      ["address_line1", "a".repeat(201)],
      ["address_line2", "a".repeat(201)],
      ["city", "c".repeat(101)],
      ["region", "r".repeat(101)],
      ["postal_code", "p".repeat(21)],
      ["notes", "n".repeat(5001)],
    ];
    for (const [field, value] of fields) {
      const result = createClientSchema.safeParse(record({ name: "Acme", [field]: value }));
      expect(result.success, `expected ${field} to be rejected`).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain(field);
      }
    }
  });

  it("rejects server-managed fields", () => {
    for (const field of ["id", "created_at", "updated_at", "archived_at"]) {
      const result = createClientSchema.safeParse(record({ name: "Acme", [field]: "value" }));
      expect(result.success, `expected ${field} to be rejected`).toBe(false);
      if (!result.success) {
        assertUnrecognizedKey(result.error, field);
      }
    }
  });

  it("rejects unknown fields", () => {
    const result = createClientSchema.safeParse(record({
      name: "Acme",
      website: "https://example.com",
    }));
    expect(result.success).toBe(false);
    if (!result.success) {
      assertUnrecognizedKey(result.error, "website");
    }
  });
});

describe("updateClientSchema", () => {
  it("accepts a valid partial update", () => {
    const result = updateClientSchema.safeParse({ email: "new@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("new@example.com");
      expect(result.data.name).toBeUndefined();
    }
  });

  it("accepts a full-field update", () => {
    const result = updateClientSchema.safeParse({
      name: "Renamed Studio",
      kind: "person",
      city: "Marseille",
      country: "FR",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Renamed Studio");
      expect(result.data.kind).toBe("person");
    }
  });

  it("rejects an empty update", () => {
    const result = updateClientSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an update where every supplied field is missing", () => {
    const result = updateClientSchema.safeParse({
      name: undefined,
      email: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("trims supplied string fields", () => {
    const result = updateClientSchema.safeParse({ name: "  Trimmed  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Trimmed");
    }
  });

  it("rejects an invalid email when email is supplied", () => {
    const result = updateClientSchema.safeParse({ email: "nope" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("email");
    }
  });

  it("rejects server-managed fields", () => {
    for (const field of ["id", "created_at", "updated_at", "archived_at"]) {
      const result = updateClientSchema.safeParse(record({ name: "Acme", [field]: "value" }));
      expect(result.success, `expected ${field} to be rejected`).toBe(false);
      if (!result.success) {
        assertUnrecognizedKey(result.error, field);
      }
    }
  });

  it("rejects unknown fields", () => {
    const result = updateClientSchema.safeParse(record({ website: "https://example.com" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      assertUnrecognizedKey(result.error, "website");
    }
  });
});
