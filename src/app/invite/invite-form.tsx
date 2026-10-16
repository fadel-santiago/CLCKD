"use client";
import { useSyncExternalStore, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimInvitationAction } from "../access/actions";

let invitationToken = "";
function subscribe(callback: () => void) {
  const value = window.location.hash.slice(1);
  if (/^[a-f0-9]{64}$/.test(value)) { invitationToken = value; window.history.replaceState(null, "", "/invite"); callback(); }
  return () => {};
}
export function InviteForm() {
  const token = useSyncExternalStore(subscribe, () => invitationToken, () => "");
  const [pending, start] = useTransition(); const [message, setMessage] = useState(""); const router = useRouter();
  function claim() {
    const data = new FormData(); data.set("token", token);
    start(async () => { try { const result = await claimInvitationAction(data); if (result.ok) { invitationToken = ""; router.replace(result.redirectTo!); router.refresh(); } else setMessage(result.message); } catch { setMessage("This invitation could not be opened. Ask the owner for a new link."); } });
  }
  return <section className="panel panelPad">{token ? <><p>A one-use invitation opens only your assigned project. It does not grant workspace management.</p><button className="button buttonPrimary" disabled={pending} onClick={claim}>{pending ? "Opening your project…" : "Open assigned project"}</button></> : <p>Open the complete invitation link from the project owner. Used, expired or revoked links need to be reissued.</p>}{message && <p className="notice" data-kind="error" role="alert">{message}</p>}</section>;
}
