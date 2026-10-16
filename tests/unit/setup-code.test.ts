import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeSetupCode, readLocalSetupCode } from "../../src/lib/access/setup-code";

describe("local setup codes", () => {
  let directory: string, filename: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "clckd-setup-code-"));
    filename = path.join(directory, "owner-setup-code");
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it("creates a stable 12-character grouped code with owner-only permissions", () => {
    const code = readLocalSetupCode(filename);
    expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){2}$/);
    expect(readLocalSetupCode(filename)).toBe(code);
    expect(fs.readFileSync(filename, "utf8")).toBe(code);
    expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
  });
  it("accepts grouping, whitespace and lower-case letters", () => {
    expect(normalizeSetupCode(" abcd efgh-jkLm\n")).toBe("ABCDEFGHJKLM");
  });
  it.each(["", "ABCD-EFGH-JKL", "ABCD-EFGH-JKLMN", "ABCD-EFGH-JKL0", "ABCD-EFGH-JKL1", "ABCD-EFGH-JKLO", "ABCD_EFGH_JKLM"])("rejects invalid code syntax: %s", value => {
    expect(normalizeSetupCode(value)).toBeNull();
  });
  it("upgrades an old file without invalidating a previously copied code", () => {
    const legacy = "a1".repeat(32);
    fs.writeFileSync(filename, legacy, { mode: 0o600 });
    const converted = readLocalSetupCode(filename);
    expect(converted).toHaveLength(14);
    expect(normalizeSetupCode(converted)).toBe(normalizeSetupCode(legacy));
    expect(readLocalSetupCode(filename)).toBe(converted);
    expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(directory)).toEqual(["owner-setup-code"]);
  });
  it("does not replace a malformed existing setup file", () => {
    fs.writeFileSync(filename, "invalid", { mode: 0o600 });
    expect(() => readLocalSetupCode(filename)).toThrow("invalid");
    expect(fs.readFileSync(filename, "utf8")).toBe("invalid");
  });
});
