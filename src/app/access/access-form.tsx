"use client";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInAction } from "./actions";

export function AccessForm({ setup }: { setup: boolean }) {
  const [pending, start] = useTransition(); const [message, setMessage] = useState(""); const router = useRouter();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    start(async () => { try { const result = await signInAction(form); if (result.ok) { router.push(result.redirectTo!); router.refresh(); } else setMessage(result.message); } catch { setMessage("The connection was interrupted. Try again."); } });
  }
  return <form className="formPanel" onSubmit={submit}><fieldset className="productionFieldset" disabled={pending}>
    <input type="hidden" name="intent" value={setup ? "setup" : "login"} />
    {setup && <><label className="field">Your name<input className="input" name="display_name" required maxLength={100} autoComplete="name" /></label><label className="field">Local setup code<input className="input" name="bootstrap_code" type="password" required minLength={12} maxLength={96} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX-XXXX" aria-describedby="setup-code-hint" /><span className="fieldHint" id="setup-code-hint">12 characters, needed only once. Paste or type the code from your Mac; spaces, hyphens and letter case do not matter. Sign in with just your passphrase afterward.</span></label></>}
    <label className="field">Owner passphrase<input className="input" name="password" type="password" required minLength={setup ? 15 : undefined} maxLength={128} autoComplete={setup ? "new-password" : "current-password"} /><span className="fieldHint">{setup ? "Use at least 15 characters. A memorable passphrase works well." : "Your workspace owner passphrase—not a client invitation."}</span></label>
    {setup && <label className="field">Confirm passphrase<input className="input" name="password_confirmation" type="password" required minLength={15} maxLength={128} autoComplete="new-password" /></label>}
    <div className="formActions"><button className="button buttonPrimary" type="submit">{pending ? "Checking access…" : setup ? "Secure my workspace" : "Sign in as owner"}</button></div>
    {message && <p className="notice" data-kind="error" role="alert">{message}</p>}
  </fieldset></form>;
}
