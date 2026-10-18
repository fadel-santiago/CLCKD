import path from "node:path";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getApplicationDatabase, DEFAULT_MIGRATIONS_DIR } from "../db/application";
import { DEFAULT_DB_PATH } from "../db/index";
import { runPendingMigrations } from "../db/migrations";
import { AccessDenied, createAccessRepository } from "./repository";
import { validateLocalOrigin } from "./origin";
import { readLocalSetupCode } from "./setup-code";
import { assertMutationsAllowed, isReadOnlyDemo } from "./demo-mode";
import { assertAnonymousDemoDatabase } from "../db/demo-database";

export const OWNER_COOKIE = "clckd_owner";
export const CLIENT_COOKIE = "clckd_client";
export function accessRepository() {
  const db = getApplicationDatabase();
  if (!db.readonly) runPendingMigrations(db, DEFAULT_MIGRATIONS_DIR);
  return createAccessRepository(db);
}
export function localBootstrapCode() {
  assertMutationsAllowed();
  const filename = path.join(path.dirname(process.env.CLCKD_DB_PATH ?? DEFAULT_DB_PATH), "owner-setup-code");
  return readLocalSetupCode(filename);
}
export async function requestOrigin(mutation = false) {
  if (mutation) assertMutationsAllowed();
  const request = await headers();
  return validateLocalOrigin(request.get("host"), mutation ? request.get("origin") : null, mutation);
}
export async function ownerToken() { return (await cookies()).get(OWNER_COOKIE)?.value; }
export async function requireOwnerPage() {
  await requestOrigin();
  if (isReadOnlyDemo()) throw new AccessDenied("Owner operations are unavailable in the read-only demo.");
  try { return accessRepository().owner(await ownerToken()); }
  catch (error) { if (error instanceof AccessDenied) redirect("/access"); throw error; }
}
/** Only explicitly selected read pages use this guard; it grants no owner identity. */
export async function requireWorkspaceRead(): Promise<{ role: "demo_viewer" | "owner" }> {
  await requestOrigin();
  if (isReadOnlyDemo()) {
    assertAnonymousDemoDatabase(getApplicationDatabase());
    return { role: "demo_viewer" };
  }
  await requireOwnerPage();
  return { role: "owner" };
}
export async function requireOwnerAction() {
  await requestOrigin(true);
  return accessRepository().owner(await ownerToken());
}
export async function setSessionCookie(role: "owner" | "client", session: { token: string; expires_at: string }) {
  assertMutationsAllowed();
  const store = await cookies();
  store.set(role === "owner" ? OWNER_COOKIE : CLIENT_COOKIE, session.token, { httpOnly: true, sameSite: "strict", secure: false, path: "/", expires: new Date(session.expires_at) });
  // secure:false is exclusively for this enforced HTTP localhost pilot.
}
