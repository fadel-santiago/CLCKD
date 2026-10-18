import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { archiveClientAction } from "../../src/app/clients/actions";
import { ReadOnlyDemoError } from "../../src/lib/access/demo-mode";
import { initialClientMutationState } from "../../src/lib/clients/mutations";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), repository: vi.fn(), archive: vi.fn(), revalidate: vi.fn() }));
vi.mock("../../src/lib/access/server", () => ({ requireOwnerAction: mocks.guard }));
vi.mock("../../src/lib/db/application", () => ({ getApplicationClientRepository: mocks.repository }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("../../src/lib/clients/mutations", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/lib/clients/mutations")>(), archiveClientFromForm: mocks.archive,
}));

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());
describe("archive action's narrowly scoped demo rejection", () => {
  it("returns an inline error without touching the repository or revalidating", async () => {
    mocks.guard.mockRejectedValue(new ReadOnlyDemoError());
    await expect(archiveClientAction(initialClientMutationState, new FormData())).resolves.toEqual({ status: "error", message: expect.stringContaining("read-only"), fieldErrors: {} });
    expect(mocks.repository).not.toHaveBeenCalled(); expect(mocks.archive).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("retains normal owner archiving and successful revalidation", async () => {
    const repository = {}; const form = new FormData();
    const result = { status: "success", message: "Client archived.", fieldErrors: {} };
    mocks.guard.mockResolvedValue({}); mocks.repository.mockReturnValue(repository); mocks.archive.mockReturnValue(result);
    await expect(archiveClientAction(initialClientMutationState, form)).resolves.toBe(result);
    expect(mocks.archive).toHaveBeenCalledWith(repository, form); expect(mocks.revalidate).toHaveBeenCalledWith("/clients");
  });
  it("does not swallow authentication failures or unrelated errors", async () => {
    const error = new Error("Sign in as the workspace owner"); mocks.guard.mockRejectedValue(error);
    await expect(archiveClientAction(initialClientMutationState, new FormData())).rejects.toBe(error);
    expect(mocks.repository).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
