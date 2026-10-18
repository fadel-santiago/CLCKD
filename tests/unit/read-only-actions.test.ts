import { afterEach, describe, expect, it, vi } from "vitest";
import * as clients from "../../src/app/clients/actions";
import * as client from "../../src/app/clients/[id]/actions";
import * as projects from "../../src/app/projects/actions";
import * as production from "../../src/app/projects/production-actions";
import * as invitations from "../../src/app/projects/invitation-actions";
import * as access from "../../src/app/access/actions";
import { localBootstrapCode, requestOrigin, setSessionCookie } from "../../src/lib/access/server";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "127.0.0.1:3300", origin: "http://127.0.0.1:3300" })),
  cookies: vi.fn(() => { throw new Error("A blocked action must not access cookies"); }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("Unexpected redirect"); }) }));

afterEach(() => vi.unstubAllEnvs());
describe("server-side demo mutation protection", () => {
  const actions = Object.entries({ ...clients, ...client, ...projects, ...production, ...invitations, ...access });
  it.each(actions)("blocks %s before authentication, validation or writes", async (name, action) => {
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "1");
    const invoke = action as (...args: unknown[]) => Promise<unknown>;
    const outcome = await invoke(new FormData(), new FormData()).then(
      value => ({ value, error: undefined }),
      (error: unknown) => ({ value: undefined, error }),
    );
    if (outcome.error !== undefined) {
      expect(outcome.error).toBeInstanceOf(Error);
      expect((outcome.error as Error).message).toContain("read-only");
    } else if (name === "archiveClientAction") {
      expect(outcome.value).toEqual({ status: "error", message: expect.stringContaining("read-only"), fieldErrors: {} });
    } else {
      expect(outcome.value).toMatchObject({ ok: false, message: expect.stringContaining("read-only") });
    }
  });
  it("blocks direct setup-code creation and session-cookie issuance", async () => {
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "1");
    expect(() => localBootstrapCode()).toThrow("read-only");
    await expect(setSessionCookie("owner", { token: "unused", expires_at: "2099-01-01" })).rejects.toThrow("read-only");
    await expect(requestOrigin()).resolves.toBeDefined();
  });
  it("keeps the normal local-origin mutation guard unchanged when disabled or unset", async () => {
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "0");
    await expect(requestOrigin(true)).resolves.toBeDefined();
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", undefined);
    await expect(requestOrigin(true)).resolves.toBeDefined();
  });
});
