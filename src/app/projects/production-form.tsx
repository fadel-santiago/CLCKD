"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/clients/schema";
import { createProductionAction, type ProductionActionResult } from "./production-actions";
import { PaymentPlanFields } from "./payment-plan-fields";
import styles from "./payment-plan.module.css";

function showValidation(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  let parent: HTMLElement | null = field.parentElement;
  while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
  requestAnimationFrame(() => { field.focus(); field.reportValidity(); });
}

/** Keep inputs mounted on failure; a failed server save never clears a draft. */
export function ProductionMutationForm({ action, children, className = "formPanel", resetOnSuccess = false, onSubmitAttempt, onInvalidField }: {
  action: (form: FormData) => Promise<ProductionActionResult>; children: ReactNode; className?: string; resetOnSuccess?: boolean;
  onSubmitAttempt?: (form: HTMLFormElement) => boolean; onInvalidField?: (field: HTMLElement) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ProductionActionResult | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (onSubmitAttempt && !onSubmitAttempt(form)) return;
    const invalid = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:invalid,select:invalid,textarea:invalid");
    if (invalid) { onInvalidField?.(invalid); showValidation(invalid); return; }
    const data = new FormData(form);
    startTransition(async () => {
      try {
        const value = await action(data);
        setResult(value);
        if (value.ok) {
          if (resetOnSuccess) form.reset();
          if (value.redirectTo) router.push(value.redirectTo);
          router.refresh();
        }
      } catch { setResult({ ok: false, message: "The connection was interrupted. Your inputs are still here; try again." }); }
    });
  }
  return <form onSubmit={submit} noValidate className={className} aria-busy={pending}>
    <fieldset className="productionFieldset" disabled={pending}>{children}</fieldset>
    {pending && <p className="fieldHint" role="status">Saving this change…</p>}
    {result && <p className="notice workflowNotice" data-kind={result.ok ? "success" : "error"} role={result.ok ? "status" : "alert"}>{result.message}</p>}
  </form>;
}

export function ProductionForm({ clients, defaultClientId }: { clients: Client[]; defaultClientId?: string }) {
  const [kind, setKind] = useState("film");
  const [clientId, setClientId] = useState(defaultClientId ?? clients[0]?.id ?? "");
  const [step, setStep] = useState(0);
  const photo = kind === "photography";
  function next(form: HTMLFormElement) {
    const invalid = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-form-step="${step}"] input:invalid,[data-form-step="${step}"] select:invalid,[data-form-step="${step}"] textarea:invalid`);
    if (invalid) { showValidation(invalid); return; }
    setStep(Math.min(2, step + 1));
  }
  return <ProductionMutationForm action={createProductionAction} onInvalidField={(field) => setStep(Number(field.closest<HTMLElement>("[data-form-step]")?.dataset.formStep ?? 0))} onSubmitAttempt={(form) => { if (step < 2) { next(form); return false; } return true; }}>
    <nav className={styles.wizard} aria-label="Project creation steps">{["Project", "Outputs", "Agreement"].map((label, index) => <button type="button" key={label} aria-current={step === index ? "step" : undefined} onClick={() => setStep(index)}>{index + 1}. {label}</button>)}</nav>
    <p className="fieldHint">Step {step + 1} of 3 · {step === 0 ? "Start with the people and project. Dates can come later." : step === 1 ? "A useful starting specification is already filled in. Adjust only what differs." : "Choose a payment split, or leave the agreement for later."}</p>
    <section data-form-step="0" hidden={step !== 0}>
    <div className="formGrid">
      <label className="fieldWide">Project name<input className="input" name="title" required maxLength={200} placeholder="Give this production a name" /></label>
      <label className="field">Production type<select className="select" name="production_type" value={kind} onChange={(event) => setKind(event.target.value)}><option value="film">Brand / cinematic film</option><option value="photography">Photography session</option><option value="event">Event film</option><option value="custom">Custom production</option></select></label>
      <label className="field">Client<select className="select" name="client_id" value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">Add a new client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
      {!clientId && <label className="fieldWide">New client name<input className="input" name="new_client_name" required maxLength={200} placeholder="Person or company commissioning the work" /></label>}
      <label className="fieldWide">Named client approver<input className="input" name="approver_name" required maxLength={200} placeholder="Who has the final creative decision?" /><span className="fieldHint">A contact name for your records. No invitation or verified identity is created.</span></label>
    </div>
    <details className="disclosure"><summary>Optional dates, location and brief</summary><div className="formGrid">
      <label className="field">Shoot / session date<input className="input" type="date" name="shoot_date" /></label>
      <label className="field">Target delivery<input className="input" type="date" name="target_date" /></label>
      <label className="fieldWide">Location<input className="input" name="location" maxLength={300} placeholder="Studio, venue or city" /></label>
      <label className="field">Shoot timezone<input className="input" name="location_tz" defaultValue="Europe/Paris" required /></label>
      <label className="fieldWide">Brief<textarea className="textarea" name="notes" maxLength={5000} placeholder="What are we making, and why?" /></label>
    </div></details></section>
    <section data-form-step="1" hidden={step !== 1}>
    <div className="outputSetup" key={kind}>
      <span className="eyebrow">Define the result</span>
      <div className="formGrid">
        <label className="fieldWide">Main deliverable<input className="input" name="output_title" required maxLength={200} defaultValue={photo ? "Retouched gallery" : "Main film"} /></label>
        <label className="field">Format / specification<input className="input" name="format" required maxLength={200} defaultValue={photo ? "High-resolution JPEG · web + print" : "4K · 16:9 · 60 seconds"} /></label>
        <label className="field">Quantity<input className="input" name="quantity" type="number" min="1" max="999" required defaultValue={photo ? 20 : 1} /></label>
        <label className="field">Included revision rounds<input className="input" name="revision_allowance" type="number" min="0" max="20" required defaultValue={2} /></label>
      </div>
      {kind !== "custom" && <label className="workflowCheck"><input type="checkbox" name="extra_output" defaultChecked />Include {photo ? "proof selection" : "a social cut pack"} as a second output</label>}
    </div>
    </section><section data-form-step="2" hidden={step !== 2}>
    <PaymentPlanFields optional />
    </section>
    <div className="formActions">{step > 0 && <button className="button buttonSecondary" type="button" onClick={() => setStep(step - 1)}>Back</button>}{step < 2 ? <button key={`next-${step}`} className="button buttonPrimary" type="button" onClick={(event) => { event.preventDefault(); if (event.currentTarget.form) next(event.currentTarget.form); }}>Next: {step === 0 ? "Outputs" : "Agreement"} →</button> : <button key="create" className="button buttonPrimary" type="submit">Create production ↗</button>}</div>
  </ProductionMutationForm>;
}
