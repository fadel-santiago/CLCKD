"use server";
import { revalidatePath } from "next/cache";
import { accessRepository, ownerToken, requestOrigin, requireOwnerAction } from "@/lib/access/server";
export type InvitationResult = { ok: boolean; message: string; link?: string };
export async function createInvitationAction(form: FormData): Promise<InvitationResult> {
  await requireOwnerAction();
  try {
    const projectId = String(form.get("project_id") ?? "");
    const invitation = accessRepository().createInvitation(await ownerToken(), { project_id: projectId, recipient_name: String(form.get("recipient_name") ?? ""), days: Number(form.get("days")), share_payments: form.has("share_payments"), output_ids: form.getAll("output_id") });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, message: "One-use local invitation created. Copy it now; the secret link is not stored in the database.", link: `${await requestOrigin()}/invite#${invitation.token}` };
  } catch { return { ok: false, message: "Invitation could not be created. Check the recipient and selected project outputs." }; }
}
export async function revokeInvitationAction(form: FormData): Promise<InvitationResult> {
  await requireOwnerAction();
  try {
    const projectId = String(form.get("project_id") ?? "");
    accessRepository().revokeInvitation(await ownerToken(), String(form.get("invitation_id") ?? ""), projectId);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, message: "Invitation revoked. Its active client session is blocked too." };
  } catch { return { ok: false, message: "Invitation could not be revoked in this project." }; }
}
