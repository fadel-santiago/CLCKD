import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  path: vi.fn(() => "/fictional/data/demo/clckd-demo.db"),
  writable: vi.fn(), readonly: vi.fn(), seed: vi.fn(), spawn: vi.fn(),
  db: { pragma: vi.fn(), close: vi.fn() },
}));
vi.mock("../../scripts/demo-workspace", () => ({ demoDatabasePath: mocks.path, openDemoDatabase: mocks.writable, seedDemoWorkspace: mocks.seed }));
vi.mock("../../src/lib/db/demo-database", () => ({ openReadOnlyDemoDatabase: mocks.readonly }));
vi.mock("node:child_process", () => ({ spawnSync: mocks.spawn }));

describe("demo launcher read-only routing", () => {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  beforeEach(() => {
    vi.resetModules(); vi.resetAllMocks();
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "1");
    vi.stubEnv("CLCKD_DB_PATH", "/fictional/data/demo/clckd-demo.db");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.path.mockReturnValue("/fictional/data/demo/clckd-demo.db");
    mocks.writable.mockReturnValue(mocks.db); mocks.readonly.mockReturnValue(mocks.db);
    mocks.db.pragma.mockImplementation((sql: string) => sql === "integrity_check" ? "ok" : []);
    mocks.spawn.mockReturnValue({ status: 0 }); process.exitCode = undefined;
  });
  afterEach(() => { process.argv = originalArgv; process.exitCode = originalExitCode; vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  async function launch(action = "dev") {
    process.argv = [process.execPath, "scripts/demo.ts", action];
    await import("../../scripts/demo");
  }
  it("launches from the validated existing read-only database without writable initialization or seeding", async () => {
    await launch();
    expect(mocks.readonly).toHaveBeenCalledWith("/fictional/data/demo/clckd-demo.db");
    expect(mocks.writable).not.toHaveBeenCalled(); expect(mocks.seed).not.toHaveBeenCalled();
    expect(mocks.db.close).toHaveBeenCalledOnce();
    expect(mocks.db.close.mock.invocationCallOrder[0]).toBeLessThan(mocks.spawn.mock.invocationCallOrder[0]);
    expect(mocks.spawn).toHaveBeenCalledWith(process.execPath, expect.arrayContaining(["dev", "-H", "127.0.0.1", "-p", "3301"]), expect.objectContaining({ env: expect.objectContaining({ CLCKD_READ_ONLY_DEMO: "1", CLCKD_DB_PATH: "/fictional/data/demo/clckd-demo.db" }) }));
    expect(process.exitCode).toBe(0);
  });
  it.each(["missing database", "invalid fictional fixture"])("does not launch or initialize on %s", async message => {
    mocks.readonly.mockImplementation(() => { throw new Error(message); });
    await launch();
    expect(process.exitCode).toBe(1); expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.writable).not.toHaveBeenCalled(); expect(mocks.seed).not.toHaveBeenCalled();
  });
  it.each(["setup", "seed"])("blocks %s before opening a database in read-only mode", async action => {
    await launch(action);
    expect(process.exitCode).toBe(1); expect(mocks.readonly).not.toHaveBeenCalled();
    expect(mocks.writable).not.toHaveBeenCalled(); expect(mocks.seed).not.toHaveBeenCalled(); expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it("retains the normal writable demo launch", async () => {
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", "0"); await launch();
    expect(mocks.writable).toHaveBeenCalledOnce(); expect(mocks.readonly).not.toHaveBeenCalled();
    expect(mocks.spawn).toHaveBeenCalledOnce(); expect(process.exitCode).toBe(0);
  });
  it("retains explicit normal-mode seeding", async () => {
    vi.stubEnv("CLCKD_READ_ONLY_DEMO", undefined); await launch("seed");
    expect(mocks.writable).toHaveBeenCalledOnce(); expect(mocks.seed).toHaveBeenCalledWith(mocks.db);
    expect(mocks.readonly).not.toHaveBeenCalled(); expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it("fails closed on an unsafe path or an invalid mode flag", async () => {
    mocks.path.mockImplementationOnce(() => { throw new Error("unsafe path"); }); await launch();
    expect(process.exitCode).toBe(1); expect(mocks.readonly).not.toHaveBeenCalled(); expect(mocks.spawn).not.toHaveBeenCalled();
    vi.resetModules(); vi.stubEnv("CLCKD_READ_ONLY_DEMO", "true"); await launch();
    expect(mocks.writable).not.toHaveBeenCalled(); expect(mocks.readonly).not.toHaveBeenCalled(); expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
