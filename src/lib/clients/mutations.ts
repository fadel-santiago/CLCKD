import type { ClientRepository } from "./repository";
import { clientRecordSchema, createClientSchema } from "./schema";

export interface ClientMutationState {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors: Record<string, string[]>;
  clientId?: string;
}

export const initialClientMutationState: ClientMutationState = {
  status: "idle",
  message: "",
  fieldErrors: {},
};

const CREATE_CLIENT_FIELDS = [
  "name",
  "kind",
  "preferred_contact_name",
  "email",
  "phone",
  "address_line1",
  "address_line2",
  "city",
  "region",
  "postal_code",
  "country",
  "notes",
] as const;

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

interface ReadFormResult {
  data: Record<string, string>;
  fieldErrors: Record<string, string[]>;
}

function readCreateClientForm(formData: FormData): ReadFormResult {
  const data: Record<string, string> = {};
  const fieldErrors: Record<string, string[]> = {};

  for (const key of CREATE_CLIENT_FIELDS) {
    const value = formData.get(key);

    if (value === null) {
      continue;
    }

    if (typeof value !== "string") {
      fieldErrors[key] = [`${key} must be a string.`];
      continue;
    }

    if (isBlank(value)) {
      // Preserve an empty name so createClientSchema reports it as required.
      if (key === "name") {
        data[key] = value;
      }
      // Omit blank optional fields; a blank kind lets the schema default apply.
      continue;
    }

    data[key] = value;
  }

  return { data, fieldErrors };
}

function issuesToFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of issues) {
    const field = String(issue.path[0] ?? "form");
    const messages = (fieldErrors[field] ??= []);
    if (!messages.includes(issue.message)) {
      messages.push(issue.message);
    }
  }

  return fieldErrors;
}

export function createClientFromForm(
  repository: ClientRepository,
  formData: FormData,
): ClientMutationState {
  const { data, fieldErrors } = readCreateClientForm(formData);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const result = createClientSchema.safeParse(data);

  if (!result.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: issuesToFieldErrors(result.error.issues),
    };
  }

  const client = repository.createClient(result.data);

  return {
    status: "success",
    message: "Client created.",
    fieldErrors: {},
    clientId: client.id,
  };
}

function readClientFormId(formData: FormData): {
  id?: string;
  fieldErrors: Record<string, string[]>;
} {
  const value = formData.get("id");

  if (typeof value !== "string") {
    return {
      fieldErrors: { id: ["id must be a string."] },
    };
  }

  const parsed = clientRecordSchema.shape.id.safeParse(value);

  if (!parsed.success) {
    return {
      fieldErrors: {
        id: parsed.error.issues.map((issue) => issue.message),
      },
    };
  }

  return { id: parsed.data, fieldErrors: {} };
}

export function archiveClientFromForm(
  repository: ClientRepository,
  formData: FormData,
): ClientMutationState {
  const { id, fieldErrors } = readClientFormId(formData);

  if (id === undefined) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const client = repository.archiveClient(id);

  if (client === null) {
    return {
      status: "error",
      message: "Client not found.",
      fieldErrors: {},
    };
  }

  return {
    status: "success",
    message: "Client archived.",
    fieldErrors: {},
    clientId: client.id,
  };
}

export function unarchiveClientFromForm(
  repository: ClientRepository,
  formData: FormData,
): ClientMutationState {
  const { id, fieldErrors } = readClientFormId(formData);

  if (id === undefined) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const client = repository.unarchiveClient(id);

  if (client === null) {
    return {
      status: "error",
      message: "Client not found.",
      fieldErrors: {},
    };
  }

  return {
    status: "success",
    message: "Client restored.",
    fieldErrors: {},
    clientId: client.id,
  };
}
