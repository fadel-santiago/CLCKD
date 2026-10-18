/** Explicit opt-in only; invalid values must never silently enable writes. */
export function isReadOnlyDemo(): boolean {
  const value = process.env.CLCKD_READ_ONLY_DEMO;
  if (value === undefined || value === "0") return false;
  if (value === "1") return true;
  throw new Error("CLCKD_READ_ONLY_DEMO must be 0 or 1.");
}

export class ReadOnlyDemoError extends Error {
  constructor() {
    super("This demo is read-only. Changes and access setup are disabled.");
    this.name = "ReadOnlyDemoError";
  }
}

export function assertMutationsAllowed(): void {
  if (isReadOnlyDemo()) throw new ReadOnlyDemoError();
}
