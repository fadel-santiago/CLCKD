import { describe, expect, it } from "vitest";

import {
  archiveClientFromForm,
  createClientFromForm,
  initialClientMutationState,
  unarchiveClientFromForm,
} from "../../src/lib/clients/mutations";
import { type ClientRepository } from "../../src/lib/clients/repository";
import { type Client } from "../../src/lib/clients/schema";

// ---------------------------------------------------------------------------
// Deterministic fixtures
// ---------------------------------------------------------------------------

const CLIENT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

const NOW = "2026-09-17T14:00:00.000Z";

const clientFixture: Client = {
  id: CLIENT_ID,
  name: "Acme Studio",
  kind: "organization",
  preferred_contact_name: null,
  email: "studio@acme.example",
  phone: null,
  address_line1: null,
  address_line2: null,
  city: null,
  region: null,
  postal_code: null,
  country: null,
  notes: null,
  created_at: NOW,
  updated_at: NOW,
  archived_at: null,
};

// ---------------------------------------------------------------------------
// Typed fake repository
// ---------------------------------------------------------------------------

type RecordedCall = {
  method: string;
  args: readonly unknown[];
};

interface FakeRepositoryOptions {
  createClient?: (data: unknown) => Client;
  archiveClient?: (id: string) => Client | null;
  unarchiveClient?: (id: string) => Client | null;
}

function createFakeRepository(options: FakeRepositoryOptions = {}): {
  repository: ClientRepository;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];

  const record = (method: string, args: readonly unknown[]): void => {
    calls.push({ method, args });
  };

  const repository: ClientRepository = {
    listClients: (options?: unknown) => {
      record("listClients", [options]);
      return [clientFixture];
    },
    getClientById: (id) => {
      record("getClientById", [id]);
      return clientFixture;
    },
    createClient: (data) => {
      record("createClient", [data]);
      return options.createClient
        ? options.createClient(data)
        : clientFixture;
    },
    updateClient: (id, data) => {
      record("updateClient", [id, data]);
      return clientFixture;
    },
    archiveClient: (id) => {
      record("archiveClient", [id]);
      return options.archiveClient
        ? options.archiveClient(id)
        : clientFixture;
    },
    unarchiveClient: (id) => {
      record("unarchiveClient", [id]);
      return options.unarchiveClient
        ? options.unarchiveClient(id)
        : clientFixture;
    },
  };

  return { repository, calls };
}

function callsTo(calls: ReadonlyArray<RecordedCall>, method: string) {
  return calls.filter((call) => call.method === method);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validCreateFormData(): FormData {
  const formData = new FormData();
  formData.set("name", "Acme Studio");
  formData.set("email", "studio@acme.example");
  return formData;
}

function idFormData(id: string): FormData {
  const formData = new FormData();
  formData.set("id", id);
  return formData;
}

// ---------------------------------------------------------------------------
// 1. initialClientMutationState
// ---------------------------------------------------------------------------

describe("initialClientMutationState", () => {
  it("is idle with an empty message and no field errors", () => {
    expect(initialClientMutationState.status).toBe("idle");
    expect(initialClientMutationState.message).toBe("");
    expect(initialClientMutationState.fieldErrors).toEqual({});
    expect(initialClientMutationState.clientId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Valid minimal create
// ---------------------------------------------------------------------------

describe("createClientFromForm — valid minimal create", () => {
  it("returns success with the created client ID and calls createClient once", () => {
    const { repository, calls } = createFakeRepository();

    const result = createClientFromForm(repository, validCreateFormData());

    expect(result.status).toBe("success");
    expect(result.clientId).toBe(CLIENT_ID);
    expect(result.fieldErrors).toEqual({});
    expect(result.message).toBeTruthy();
    expect(callsTo(calls, "createClient")).toHaveLength(1);
  });

  it("applies the schema default kind of organization when kind is blank", () => {
    const { repository, calls } = createFakeRepository();

    const formData = validCreateFormData();
    formData.set("kind", "");

    const result = createClientFromForm(repository, formData);

    expect(result.status).toBe("success");
    const createCalls = callsTo(calls, "createClient");
    expect(createCalls).toHaveLength(1);
    const data = createCalls[0].args[0] as Record<string, unknown>;
    expect(data.kind).toBe("organization");
  });
});

// ---------------------------------------------------------------------------
// 3. Create input normalization
// ---------------------------------------------------------------------------

describe("createClientFromForm — input normalization", () => {
  it("omits whitespace-only optional fields and keeps supplied fields", () => {
    const { repository, calls } = createFakeRepository();

    const formData = validCreateFormData();
    formData.set("preferred_contact_name", "   ");
    formData.set("phone", "");
    formData.set("address_line1", "  \t ");
    formData.set("city", "Lyon");
    formData.set("notes", "Prefers evening calls");

    const result = createClientFromForm(repository, formData);

    expect(result.status).toBe("success");
    const data = callsTo(calls, "createClient")[0].args[0] as Record<
      string,
      unknown
    >;
    expect(data.preferred_contact_name).toBeUndefined();
    expect(data.phone).toBeUndefined();
    expect(data.address_line1).toBeUndefined();
    expect(data.city).toBe("Lyon");
    expect(data.notes).toBe("Prefers evening calls");
    expect(data.name).toBe("Acme Studio");
    expect(data.email).toBe("studio@acme.example");
  });
});

// ---------------------------------------------------------------------------
// 4. Validation failures
// ---------------------------------------------------------------------------

describe("createClientFromForm — validation failures", () => {
  it.each([
    ["empty name", "name", ""],
    ["whitespace-only name", "name", "   "],
  ])("%s produces a name field error", (_label, field, value) => {
    const { repository, calls } = createFakeRepository();

    const formData = validCreateFormData();
    formData.set(field, value);

    const result = createClientFromForm(repository, formData);

    expect(result.status).toBe("error");
    expect(result.fieldErrors.name).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
    expect(callsTo(calls, "createClient")).toHaveLength(0);
  });

  it("invalid email produces an email field error without a repository call", () => {
    const { repository, calls } = createFakeRepository();

    const formData = validCreateFormData();
    formData.set("email", "not-an-email");

    const result = createClientFromForm(repository, formData);

    expect(result.status).toBe("error");
    expect(result.fieldErrors.email).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
    expect(callsTo(calls, "createClient")).toHaveLength(0);
  });

  it("invalid phone produces a phone field error without a repository call", () => {
    const { repository, calls } = createFakeRepository();

    const formData = validCreateFormData();
    formData.set("phone", "12345");

    const result = createClientFromForm(repository, formData);

    expect(result.status).toBe("error");
    expect(result.fieldErrors.phone).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
    expect(callsTo(calls, "createClient")).toHaveLength(0);
  });

  it("invalid country produces a country field error without a repository call", () => {
    const { repository, calls } = createFakeRepository();

    const formData = validCreateFormData();
    formData.set("country", "FRANCE");

    const result = createClientFromForm(repository, formData);

    expect(result.status).toBe("error");
    expect(result.fieldErrors.country).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
    expect(callsTo(calls, "createClient")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Recognized non-string FormData values
// ---------------------------------------------------------------------------

describe("createClientFromForm — non-string values", () => {
  it("rejects a non-string value for a recognized field", () => {
    const { repository, calls } = createFakeRepository();

    const formData = validCreateFormData();
    formData.set("email", new File(["bytes"], "email.dat"));

    const result = createClientFromForm(repository, formData);

    expect(result.status).toBe("error");
    expect(result.fieldErrors.email).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
    expect(callsTo(calls, "createClient")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Unknown and server-managed keys
// ---------------------------------------------------------------------------

describe("createClientFromForm — unknown and server-managed keys", () => {
  it("ignores unknown and server-managed keys while keeping valid fields", () => {
    const { repository, calls } = createFakeRepository();

    const formData = validCreateFormData();
    formData.set("id", "ATTACKER-CONTROLLED-ID");
    formData.set("created_at", NOW);
    formData.set("updated_at", NOW);
    formData.set("archived_at", NOW);
    formData.set("archived", "true");
    formData.set("table", "clients");
    formData.set("sql", "DROP TABLE clients");
    formData.set("kind", "person");

    const result = createClientFromForm(repository, formData);

    expect(result.status).toBe("success");
    const data = callsTo(calls, "createClient")[0].args[0] as Record<
      string,
      unknown
    >;
    expect(data.id).toBeUndefined();
    expect(data.created_at).toBeUndefined();
    expect(data.updated_at).toBeUndefined();
    expect(data.archived_at).toBeUndefined();
    expect(data.archived).toBeUndefined();
    expect(data.table).toBeUndefined();
    expect(data.sql).toBeUndefined();
    expect(data.name).toBe("Acme Studio");
    expect(data.email).toBe("studio@acme.example");
    expect(data.kind).toBe("person");
  });
});

// ---------------------------------------------------------------------------
// 7 & 8. Valid archive / unarchive
// ---------------------------------------------------------------------------

describe("archiveClientFromForm", () => {
  it("archives a valid ID and returns success with the client ID", () => {
    const { repository, calls } = createFakeRepository();

    const result = archiveClientFromForm(repository, idFormData(CLIENT_ID));

    expect(result.status).toBe("success");
    expect(result.clientId).toBe(CLIENT_ID);
    expect(result.fieldErrors).toEqual({});
    expect(result.message).toBeTruthy();
    const archiveCalls = callsTo(calls, "archiveClient");
    expect(archiveCalls).toHaveLength(1);
    expect(archiveCalls[0].args).toEqual([CLIENT_ID]);
  });
});

describe("unarchiveClientFromForm", () => {
  it("unarchives a valid ID and returns success with the client ID", () => {
    const { repository, calls } = createFakeRepository();

    const result = unarchiveClientFromForm(repository, idFormData(CLIENT_ID));

    expect(result.status).toBe("success");
    expect(result.clientId).toBe(CLIENT_ID);
    expect(result.fieldErrors).toEqual({});
    expect(result.message).toBeTruthy();
    const unarchiveCalls = callsTo(calls, "unarchiveClient");
    expect(unarchiveCalls).toHaveLength(1);
    expect(unarchiveCalls[0].args).toEqual([CLIENT_ID]);
  });
});

// ---------------------------------------------------------------------------
// 9. Invalid, missing, and non-string IDs
// ---------------------------------------------------------------------------

describe("archive/unarchive — invalid IDs", () => {
  it.each([
    ["invalid id", "not-a-ulid"],
    ["empty id", ""],
    ["whitespace id", "   "],
  ])("archive rejects a %s", (_label, id) => {
    const { repository, calls } = createFakeRepository();

    const result = archiveClientFromForm(repository, idFormData(id));

    expect(result.status).toBe("error");
    expect(result.fieldErrors.id).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
    expect(callsTo(calls, "archiveClient")).toHaveLength(0);
    expect(callsTo(calls, "unarchiveClient")).toHaveLength(0);
  });

  it("archive rejects a missing id", () => {
    const { repository, calls } = createFakeRepository();

    const result = archiveClientFromForm(repository, new FormData());

    expect(result.status).toBe("error");
    expect(result.fieldErrors.id).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
    expect(callsTo(calls, "archiveClient")).toHaveLength(0);
    expect(callsTo(calls, "unarchiveClient")).toHaveLength(0);
  });

  it("archive rejects a non-string id", () => {
    const { repository, calls } = createFakeRepository();

    const formData = new FormData();
    formData.set("id", new File(["bytes"], "id.dat"));

    const result = archiveClientFromForm(repository, formData);

    expect(result.status).toBe("error");
    expect(result.fieldErrors.id).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
    expect(callsTo(calls, "archiveClient")).toHaveLength(0);
    expect(callsTo(calls, "unarchiveClient")).toHaveLength(0);
  });

  it.each([
    ["invalid id", "not-a-ulid"],
    ["empty id", ""],
    ["whitespace id", "   "],
  ])("unarchive rejects a %s", (_label, id) => {
    const { repository, calls } = createFakeRepository();

    const result = unarchiveClientFromForm(repository, idFormData(id));

    expect(result.status).toBe("error");
    expect(result.fieldErrors.id).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
    expect(callsTo(calls, "archiveClient")).toHaveLength(0);
    expect(callsTo(calls, "unarchiveClient")).toHaveLength(0);
  });

  it("unarchive rejects a missing id", () => {
    const { repository, calls } = createFakeRepository();

    const result = unarchiveClientFromForm(repository, new FormData());

    expect(result.status).toBe("error");
    expect(result.fieldErrors.id).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
    expect(callsTo(calls, "archiveClient")).toHaveLength(0);
    expect(callsTo(calls, "unarchiveClient")).toHaveLength(0);
  });

  it("unarchive rejects a non-string id", () => {
    const { repository, calls } = createFakeRepository();

    const formData = new FormData();
    formData.set("id", new File(["bytes"], "id.dat"));

    const result = unarchiveClientFromForm(repository, formData);

    expect(result.status).toBe("error");
    expect(result.fieldErrors.id).toEqual(
      expect.arrayContaining([expect.any(String)])
    );
    expect(callsTo(calls, "archiveClient")).toHaveLength(0);
    expect(callsTo(calls, "unarchiveClient")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 10. Missing client
// ---------------------------------------------------------------------------

describe("archive/unarchive — missing client", () => {
  it("returns an error state when archiveClient returns null", () => {
    const boom = new Error("boom");
    const { repository, calls } = createFakeRepository({
      archiveClient: () => {
        throw boom;
      },
    });

    // The null branch: archiveClient returns null for a valid ID.
    const { repository: missingRepo, calls: missingCalls } = createFakeRepository({
      archiveClient: () => null,
    });

    expect(() =>
      archiveClientFromForm(repository, idFormData(CLIENT_ID))
    ).toThrow(boom);
    expect(callsTo(calls, "archiveClient")).toHaveLength(1);

    const result = archiveClientFromForm(missingRepo, idFormData(CLIENT_ID));
    expect(result.status).toBe("error");
    expect(result.message).toBe("Client not found.");
    expect(result.clientId).toBeUndefined();
    expect(callsTo(missingCalls, "archiveClient")).toHaveLength(1);
  });

  it("returns an error state when unarchiveClient returns null", () => {
    const { repository, calls } = createFakeRepository({
      unarchiveClient: () => null,
    });

    const result = unarchiveClientFromForm(repository, idFormData(CLIENT_ID));

    expect(result.status).toBe("error");
    expect(result.message).toBe("Client not found.");
    expect(result.clientId).toBeUndefined();
    expect(callsTo(calls, "unarchiveClient")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 11. Unexpected repository errors propagate
// ---------------------------------------------------------------------------

describe("unexpected repository errors propagate", () => {
  it("propagates a createClient error", () => {
    const boom = new Error("database down");
    const { repository, calls } = createFakeRepository({
      createClient: () => {
        throw boom;
      },
    });

    const formData = validCreateFormData();

    expect(() => createClientFromForm(repository, formData)).toThrow(boom);
    expect(callsTo(calls, "createClient")).toHaveLength(1);
  });

  it("propagates an archiveClient error", () => {
    const boom = new Error("database down");
    const { repository, calls } = createFakeRepository({
      archiveClient: () => {
        throw boom;
      },
    });

    expect(() =>
      archiveClientFromForm(repository, idFormData(CLIENT_ID))
    ).toThrow(boom);
    expect(callsTo(calls, "archiveClient")).toHaveLength(1);
  });

  it("propagates an unarchiveClient error", () => {
    const boom = new Error("database down");
    const { repository, calls } = createFakeRepository({
      unarchiveClient: () => {
        throw boom;
      },
    });

    expect(() =>
      unarchiveClientFromForm(repository, idFormData(CLIENT_ID))
    ).toThrow(boom);
    expect(callsTo(calls, "unarchiveClient")).toHaveLength(1);
  });
});
