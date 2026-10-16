"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { accessRepository, localBootstrapCode, requestOrigin, setSessionCookie, OWNER_COOKIE, CLIENT_COOKIE } from "@/lib/access/server";

export type AccessResult = { ok: boolean; message: string; redirectTo?: string };
export async function signInAction(form: FormData): Promise<AccessResult> {
  try {
    await requestOrigin(true);
    const repository = accessRepository();
    const password = String(form.get("password") ?? "");
    let session;
    if (form.get("intent") === "setup") {
      if (password !== String(form.get("password_confirmation") ?? "")) throw new Error("Your passphrases do not match");
      session = repository.setup({ display_name: String(form.get("display_name") ?? ""), password, bootstrap_code: String(form.get("bootstrap_code") ?? "").trim() }, localBootstrapCode());
    } else session = repository.login(password);
    await setSessionCookie("owner", session);
    return { ok: true, message: "Owner access granted", redirectTo: "/" };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message.slice(0, 200) : "Sign-in failed" }; }
}
export async function ownerSignOutAction(): Promise<void> {
  await requestOrigin(true); const store = await cookies();
  accessRepository().logout(store.get(OWNER_COOKIE)?.value); store.delete(OWNER_COOKIE);
  redirect("/access");
}
export async function claimInvitationAction(form: FormData): Promise<AccessResult> {
  try {
    await requestOrigin(true);
    const session = accessRepository().claimInvitation(String(form.get("token") ?? ""));
    await setSessionCookie("client", session);
    return { ok: true, message: "Assigned project opened", redirectTo: `/client/${session.project_id}` };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message.slice(0, 200) : "The invitation is unavailable" }; }
}
export async function clientSignOutAction(): Promise<void> {
  await requestOrigin(true); const store = await cookies();
  accessRepository().logout(store.get(CLIENT_COOKIE)?.value); store.delete(CLIENT_COOKIE);
  redirect("/invite");
}
