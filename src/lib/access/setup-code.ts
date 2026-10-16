import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";

// 32 symbols, excluding 0/O and 1/I. Twelve independent symbols give 60 bits.
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const encode = (bytes: Buffer) => Array.from(bytes, (byte) => alphabet[byte & 31]).join("");

export function normalizeSetupCode(value: string): string | null {
  const compact = value.replace(/[\s-]/g, "").toUpperCase();
  // Preserve compatibility with previously copied 64-character setup secrets.
  if (/^[A-F0-9]{64}$/.test(compact)) {
    return encode(createHash("sha256").update(compact.toLowerCase()).digest().subarray(0, 12));
  }
  return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/.test(compact) ? compact : null;
}

export function readLocalSetupCode(filename: string): string {
  if (!fs.existsSync(filename)) {
    try {
      const code = encode(randomBytes(12)).match(/.{4}/g)!.join("-");
      fs.writeFileSync(filename, code, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  const stored = fs.readFileSync(filename, "utf8").trim();
  const normalized = normalizeSetupCode(stored);
  if (!normalized) throw new Error("The local setup-code file is invalid. Restore it from a trusted backup.");
  const formatted = normalized.match(/.{4}/g)!.join("-");
  if (stored !== formatted) {
    // Upgrade old codes atomically; concurrent readers never see a partial code.
    const temporary = `${filename}.${randomBytes(8).toString("hex")}.tmp`;
    try {
      fs.writeFileSync(temporary, formatted, { flag: "wx", mode: 0o600 });
      fs.renameSync(temporary, filename);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  return formatted;
}
