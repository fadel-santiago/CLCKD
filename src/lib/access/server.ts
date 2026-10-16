import path from "node:path";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getApplicationDatabase, DEFAULT_MIGRATIONS_DIR } from "../db/application";
import { DEFAULT_DB_PATH } from "../db/index";
import { runPendingMigrations } from "../db/migrations";
import { AccessDenied, createAccessRepository } from "./repository";
import { validateLocalOrigin } from "./origin";
import { readLocalSetupCode } from "./setup-code";

export const OWNER_COOKIE = "clckd_owner";
export const CLIENT_COOKIE = "clckd_client";
export function accessRepository() {
  const db = getApplicationDatabase();
  runPendingMigrations(db, DEFAULT_MIGRATIONS_DIR);
  return createAccessRepository(db);
}
export function localBootstrapCode() {
  const filename = path.join(path.dirname(process.env.CLCKD_DB_PATH ?? DEFAULT_DB_PATH), "owner-setup-code");
  return readLocalSetupCode(filename);
}
export async function requestOrigin(mutation = false) {
  const request = await headers();
  return validateLocalOrigin(request.get("host"), mutation ? request.get("origin") : null, mutation);
}
export async function ownerToken() { return (await cookies()).get(OWNER_COOKIE)?.value; }
export async function requireOwnerPage() {
  await requestOrigin();
  try { return accessRepository().owner(await ownerToken()); }
  catch (error) { if (error instanceof AccessDenied) redirect("/access"); throw error; }
}
export async function requireOwnerAction() {
  await requestOrigin(true);
  return accessRepository().owner(await ownerToken());
}
export async function setSessionCookie(role: "owner" | "client", session: { token: string; expires_at: string }) {
  const store = await cookies();
  store.set(role === "owner" ? OWNER_COOKIE : CLIENT_COOKIE, session.token, { httpOnly: true, sameSite: "strict", secure: false, path: "/", expires: new Date(session.expires_at) });
  // secure:false is exclusively for this enforced HTTP localhost pilot.
}
