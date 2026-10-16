"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ProductionOutput, ProductionWorkspace } from "@/lib/production/repository";
import { DELIVERABLE_TYPE_LABELS, REVIEW_STATUS_LABELS, PROJECT_STATUS_LABELS } from "@/lib/operations/presentation";
import { deliverableTypes } from "@/lib/operations/schema";
import { productionAction } from "./production-actions";
import { ProductionMutationForm } from "./production-form";
import styles from "./production-workspace.module.css";
import { PaymentWorkspace, PaymentSummary } from "./payment-workspace";
import { ClientPreview } from "./client-preview";

const tabs = ["brief", "outputs", "shoot", "work", "review", "delivery", "payments", "client", "history"] as const;
type Tab = typeof tabs[number];
const tabLabels: Record<Tab, string> = { brief: "Brief", outputs: "Outputs", shoot: "Shoot", work: "Work", review: "Review", delivery: "Delivery", payments: "Payments", client: "Client preview", history: "History" };
function subscribeHash(listener: () => void) { window.addEventListener("hashchange", listener); return () => window.removeEventListener("hashchange", listener); }
function recordTime(value: string): string { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC"; }

function Hidden({ projectId, intent, output }: { projectId: string; intent: string; output?: ProductionOutput }) {
  return <>
    <input type="hidden" name="project_id" value={projectId} />
    <input type="hidden" name="intent" value={intent} />
    {output && <><input type="hidden" name="output_id" value={output.id} /><input type="hidden" name="expected_revision" value={output.revision} /><input type="hidden" name="expected_link" value={output.current.link ?? ""} /><input type="hidden" name="expected_scope_revision" value={output.scope_revision} /></>}
  </>;
}
function safeHref(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function OutputLink({ link }: { link: string | null }) {
  const href = safeHref(link);
  return href ? <a className="subtleLink" href={href} target="_blank" rel="noopener noreferrer">Open external work ↗</a> : <span className="muted">{link ? "Stored link is not a web preview" : "No external link yet"}</span>;
}
function outputLabel(output: ProductionOutput): string { return output.current.delivered_at ? "Delivered" : REVIEW_STATUS_LABELS[output.current.review_status]; }
function OutputForm({ projectId, output }: { projectId: string; output?: ProductionOutput }) {
  return <ProductionMutationForm action={productionAction} className="workflowForm" resetOnSuccess={!output}>
    <Hidden projectId={projectId} intent="output" />
    {output && <input type="hidden" name="output_id" value={output.id} />}
    <div className="formGrid">
      <label className="fieldWide">Output name<input className="input" name="title" required maxLength={200} defaultValue={output?.title ?? ""} placeholder="Main film, social cut, final gallery…" /></label>
      <label className="field">Type<select className="select" name="type" defaultValue={output?.type ?? "final_master"}>{deliverableTypes.map((type) => <option key={type} value={type}>{DELIVERABLE_TYPE_LABELS[type]}</option>)}</select></label>
      <label className="field">Format / specification<input className="input" name="format" required maxLength={200} defaultValue={output?.format ?? ""} placeholder="4K · 16:9, high-resolution JPEG…" /></label>
      <label className="field">Quantity<input className="input" name="quantity" type="number" min="1" max="999" required defaultValue={output?.quantity ?? 1} /></label>
      <label className="field">Included revision rounds<input className="input" name="revision_allowance" type="number" min="0" max="20" required defaultValue={output?.revision_allowance ?? 2} /></label>
      <label className="field">Deadline<input className="input" name="due_date" type="date" defaultValue={output?.due_date ?? ""} /></label>
    </div>
    <div className="formActions"><button className="button buttonPrimary" type="submit">{output ? "Save planned output" : "Add planned output"}</button></div>
  </ProductionMutationForm>;
}

function OutputReview({ workspace, output }: { workspace: ProductionWorkspace; output: ProductionOutput }) {
  const [confirming, setConfirming] = useState(false);
  const current = output.current;
  const submitted = current.review_status !== "not_submitted";
  const extraRound = output.revision > output.revision_allowance;
  const blockedPayments = workspace.paymentPlan?.milestones.filter((item) => ["production", "post_production"].includes(item.work_gate) && !item.paid_at) ?? [];
  return <>
    <article className={styles.outputCard}>
      <div className={styles.cardTop}><div><span className="eyebrow">One output. One decision.</span><h2>{output.title} <span className={styles.version}>v{output.revision}</span></h2></div><span className="statusBadge" data-tone={current.review_status === "approved" ? "success" : current.review_status === "changes_requested" ? "warning" : undefined}>{outputLabel(output)}</span></div>
      <p className={styles.meta}>{output.quantity} × {output.format || "Format not recorded"} · {output.due_date ? `due ${output.due_date}` : "No deadline"} · {output.revision_allowance} included revision rounds</p>
      <div className={styles.cover}><span>External review / {workspace.settings.production_type === "photography" ? "Photography" : "Film"}</span><strong>{output.title}</strong><OutputLink link={current.link} /></div>
      {current.feedback && <div className={styles.feedback}><strong>Feedback on this version</strong><p>{current.feedback}</p></div>}
      {current.review_status === "approved" ? <div className={styles.receipt}>
        <h3>Approval recorded for version {output.revision}.</h3>
        <p>{current.approved_at ? `Client decision attributed to ${current.approved_by || "the reported approver"}; entered by you.` : "Imported approval status. No client confirmation timestamp was invented."}</p>
        {!current.delivered_at ? <ProductionMutationForm action={productionAction} className="workflowForm"><Hidden projectId={workspace.project.id} intent="decision" output={output} /><input type="hidden" name="decision_kind" value="undo" /><input type="hidden" name="details" value="Clicked accidentally" /><button className="button buttonSecondary" type="submit">Undo recorded approval</button></ProductionMutationForm> : <details className="disclosure"><summary>Record an approval correction after delivery</summary><DecisionForm projectId={workspace.project.id} output={output} kind="correction" label="Record correction request" /></details>}
        <p className="fieldHint">{current.delivered_at ? "Completed delivery stays recorded. Files sent outside CLCKD cannot be recalled here." : "Undo returns this output to review and keeps the original decision in history."}</p>
      </div> : submitted ? <>
        <div className={styles.reviewActions}>
          <details className="disclosure"><summary>Record requested changes</summary><DecisionForm projectId={workspace.project.id} output={output} kind="changes" label="Record requested changes" /></details>
          <button type="button" className="button buttonPrimary" onClick={() => setConfirming(true)}>Record approval received</button>
        </div>
        {confirming && <section className={styles.confirmation} aria-label="Approval confirmation">
          <span className="eyebrow">A deliberate decision</span><h3>Record approval of this exact version?</h3>
          <p>{workspace.project.title} / {output.title} / version {output.revision}</p><OutputLink link={current.link} />
          <ProductionMutationForm action={productionAction} className="workflowForm"><Hidden projectId={workspace.project.id} intent="decision" output={output} /><input type="hidden" name="decision_kind" value="approve" />
            <label className="workflowCheck"><input type="checkbox" name="confirmed" required />I received approval from {workspace.settings.approver_name || "the named approver"} for this exact creative result. This does not authorize publication or mark a payment received.</label>
            <div className="formActions"><button type="button" className="button buttonSecondary" onClick={() => setConfirming(false)}>Back to review</button><button type="submit" className="button buttonPrimary">Confirm recorded approval</button></div>
          </ProductionMutationForm>
        </section>}
      </> : <p className={styles.meta}>Submit an external review link before recording a decision.</p>}
      <details className="disclosure"><summary>{submitted ? "Create and submit a new revision" : "Submit this version for review"}</summary>
        {!workspace.settings.scope_confirmed_at && <p className="notice" data-kind="error">Record the current scope confirmation in Brief before submitting for review. Your link can be pasted below, but cannot be saved until that agreement is recorded.</p>}
        {blockedPayments.length > 0 && <p className="notice" data-kind="error">Before submitting edits, record the required external payments in Payments: {blockedPayments.map((item) => item.title).join(", ")}. This is a workflow gate, not a problem with your review link.</p>}
        <ProductionMutationForm action={productionAction} className="workflowForm" resetOnSuccess>
          <Hidden projectId={workspace.project.id} intent="review" output={output} />
          <label className="field">External review link (HTTPS)<input className="input" name="link" type="text" inputMode="url" required maxLength={4000} defaultValue={safeHref(current.link) ? current.link || "" : ""} placeholder="https:// — Vimeo, Drive, Frame.io or another review link" /><span className="fieldHint">Use https://. If you paste a web address without a protocol, we add https:// automatically. Check that your client has permission to open it.</span></label>
          <label className="field">{submitted ? "What changed?" : "Review context"}<textarea className="textarea" name="change_note" maxLength={2000} required={submitted} /></label>
          {submitted && <label className="workflowCheck"><input type="checkbox" name="new_revision" required />Explicitly create version {output.revision + 1}. Approval of this output resets; other outputs are unchanged.</label>}
          {submitted && extraRound && <label className="workflowCheck"><input type="checkbox" name="extra_revision_agreed" required />I agreed this additional revision outside the included allowance with the client. No fee is collected here.</label>}
          <div className="formActions"><button className="button buttonPrimary" type="submit" disabled={!workspace.settings.scope_confirmed_at || blockedPayments.length > 0}>{submitted ? `Submit version ${output.revision + 1}` : "Submit for review"}</button></div>
        </ProductionMutationForm>
      </details>
    </article>
    <section className={`${styles.outputCard} ${styles.historyCard}`}><h3>Version history</h3>{output.versions.map((version) => <div className={styles.historyRow} key={version.revision}><div><strong>Version {version.revision}</strong><p>{version.change_note || "No change note recorded"}</p><OutputLink link={version.link} />{version.feedback && <p>Feedback: {version.feedback}</p>}</div><span className="statusBadge">{version.delivered_at ? "Delivered" : REVIEW_STATUS_LABELS[version.review_status]}</span></div>)}</section>
  </>;
}

function DecisionForm({ projectId, output, kind, label }: { projectId: string; output: ProductionOutput; kind: "changes" | "correction"; label: string }) {
  return <ProductionMutationForm action={productionAction} className="workflowForm" resetOnSuccess><Hidden projectId={projectId} intent="decision" output={output} /><input type="hidden" name="decision_kind" value={kind} /><label className="field">{kind === "changes" ? "Client feedback" : "Reason and context"}<textarea className="textarea" name="details" required maxLength={2000} /></label><div className="formActions"><button type="submit" className="button buttonSecondary">{label}</button></div></ProductionMutationForm>;
}

function RestoreRecords({ projectId, kind, records }: { projectId: string; kind: "output" | "shoot" | "task"; records: { id: string; label: string }[] }) {
  if (!records.length) return null;
  return <details className={`${styles.outputCard} disclosure`}><summary>Archived {kind}s ({records.length})</summary><p className="fieldHint">Restore these records individually. Existing versions and decisions remain stored.</p>{records.map((record) => <ProductionMutationForm key={record.id} action={productionAction} className="workflowForm"><Hidden projectId={projectId} intent="restore_record" /><input type="hidden" name="record_kind" value={kind} /><input type="hidden" name="record_id" value={record.id} /><p>{record.label}</p><button className="button buttonSecondary" type="submit">Restore {kind}</button></ProductionMutationForm>)}</details>;
}

const eventLabels: Record<string, string> = {
  project_created: "Project created", output_planned: "Output planned", scope_revised: "Scope revised", scope_confirmed: "Client scope confirmation recorded", scope_reopened: "Scope reopened", shoot_completed: "Production completed", review_submitted: "Version submitted", approval_recorded: "Client approval recorded", changes_requested: "Changes requested", approval_withdrawn: "Approval withdrawn", output_delivered: "Output delivered", approval_correction_requested: "Approval correction requested", project_wrapped: "Project wrapped",
};

export function ProductionWorkspaceView({ workspace, initialTab = "brief", shootsContent, workContent, commercialContent }: {
  workspace: ProductionWorkspace; initialTab?: string; shootsContent: ReactNode; workContent: ReactNode; commercialContent: ReactNode;
}) {
  const router = useRouter();
  const [chosenTab, setTab] = useState<Tab | null>(null);
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const legacyTab = ({ "#post": "review", "#shoots": "shoot", "#tasks": "work" } as const)[hash as "#post" | "#shoots" | "#tasks"];
  const tab: Tab = chosenTab ?? legacyTab ?? (tabs.includes(initialTab as Tab) ? initialTab as Tab : "brief");
  const [selectedId, setSelectedId] = useState(workspace.outputs[0]?.id ?? "");
  const selected = workspace.outputs.find((item) => item.id === selectedId) ?? workspace.outputs[0];
  const delivered = workspace.outputs.filter((item) => item.current.delivered_at).length;
  const approved = workspace.outputs.filter((item) => item.current.review_status === "approved").length;
  function navigate(next: Tab) { setTab(next); router.replace(`/projects/${workspace.project.id}?tab=${next}`, { scroll: false }); }
  return <>
    <header className={styles.hero}>
      <Link href="/projects" className="subtleLink">Projects / {workspace.project.client_name}</Link>
      <div className={styles.titleRow}><h1 className="pageTitle">{workspace.project.title}</h1><span className="statusBadge" data-tone={workspace.readyToWrap ? "success" : undefined}>{workspace.readyToWrap && workspace.project.status !== "completed" ? "Ready to wrap" : PROJECT_STATUS_LABELS[workspace.project.status]}</span></div>
      <p className={styles.meta}>{workspace.settings.production_type === "photography" ? "Photography production" : "Film production"} · {approved}/{workspace.outputs.length} outputs approved · {delivered}/{workspace.outputs.length} delivered</p>
      <p className={styles.localNote}>Local workspace · client decisions are recorded by you. No client invitation, payment handling or public verification is implied.</p>
    </header>
    <nav className={styles.tabs} aria-label="Project sections">{tabs.map((value, index) => <button type="button" key={value} onClick={() => navigate(value)} aria-current={tab === value ? "page" : undefined}><span>{index + 1}</span>{tabLabels[value]}</button>)}</nav>
    {tab === "brief" && <>
      <section className={styles.outputCard}><span className="eyebrow">Everyone sees the same picture</span><h2>Agreed scope</h2><p className={styles.meta}>Scope version {workspace.settings.scope_revision} · {workspace.settings.scope_confirmed_at ? "Confirmation recorded" : "Awaiting confirmation"}</p><dl className="detailList"><div><dt>Client</dt><dd>{workspace.project.client_name}</dd></div><div><dt>Approver</dt><dd>{workspace.settings.approver_name || "Not set"}</dd></div><div><dt>Dates</dt><dd>{workspace.project.start_date || "Shoot not set"} → {workspace.project.end_date || "Delivery not set"}</dd></div></dl>{workspace.project.notes && <p className={styles.notes}>{workspace.project.notes}</p>}
        {workspace.outputs.map((item) => <div className={styles.scopeOutput} key={item.id}><strong>{item.title}</strong><span>{item.quantity} × {item.format || "Format not recorded"} · {item.due_date || "Deadline not set"} · {item.revision_allowance} revision rounds</span></div>)}
        {workspace.paymentPlan && <details className="disclosure"><summary>Payment schedule & commercial terms included in this scope</summary><PaymentSummary plan={workspace.paymentPlan} /></details>}
{workspace.settings.scope_confirmed_at ? <ProductionMutationForm action={productionAction} className="workflowForm"><Hidden projectId={workspace.project.id} intent="reopen_scope" /><button className="button buttonSecondary" type="submit">Reopen scope for agreed changes</button></ProductionMutationForm> : <ProductionMutationForm action={productionAction} className="workflowForm"><Hidden projectId={workspace.project.id} intent="scope" /><input type="hidden" name="scope_revision" value={workspace.settings.scope_revision} /><label className="workflowCheck"><input type="checkbox" name="confirmed" required />I received confirmation from {workspace.settings.approver_name || "the named client approver"} for these outputs, dates, revision allowances and any payment terms shown here.</label><button className="button buttonPrimary" type="submit">Record scope confirmation</button></ProductionMutationForm>}
      </section>
      <details className={`${styles.outputCard} disclosure`}><summary>Production details, timeline and approver</summary><ProductionMutationForm action={productionAction} className="workflowForm"><Hidden projectId={workspace.project.id} intent="settings" /><div className="formGrid"><label className="field">Production type<select className="select" name="production_type" defaultValue={workspace.settings.production_type}><option value="film">Film</option><option value="photography">Photography</option><option value="event">Event</option><option value="custom">Custom production</option></select></label><label className="field">Named approver<input className="input" name="approver_name" required maxLength={200} defaultValue={workspace.settings.approver_name || ""} /></label><label className="field">Target delivery<input className="input" name="target_date" type="date" defaultValue={workspace.project.end_date || ""} /></label><label className="fieldWide">Creative brief<textarea className="textarea" name="notes" maxLength={5000} defaultValue={workspace.project.notes || ""} /></label></div><p className="fieldHint">Changing these details reopens scope confirmation; previous decisions remain recorded.</p><button className="button buttonSecondary" type="submit">Save production details</button></ProductionMutationForm></details>
      <details className={`${styles.outputCard} disclosure`}><summary>External commercial records</summary>{commercialContent}</details>
    </>}
    {tab === "outputs" && <section><div className={styles.sectionHeading}><span className="eyebrow">Define what good looks like</span><h2>Every output, clearly defined.</h2></div>{workspace.outputs.map((item) => <article className={styles.outputCard} key={item.id}><div className={styles.cardTop}><h3>{item.title}</h3><span className="statusBadge" data-tone={item.current.review_status === "approved" ? "success" : item.current.review_status === "changes_requested" ? "warning" : undefined}>{outputLabel(item)}</span></div><p className={styles.meta}>{item.quantity} × {item.format || "Format not set"} · due {item.due_date || "not set"}</p><p className={styles.meta}>{item.revision_allowance} revision rounds · current version {item.revision}</p><button className="button buttonSecondary" type="button" onClick={() => { setSelectedId(item.id); navigate("review"); }}>Open this output ↗</button>{!workspace.settings.scope_confirmed_at && item.review_status === "not_submitted" && <details className="disclosure"><summary>Edit planned output</summary><OutputForm projectId={workspace.project.id} output={item} /></details>}</article>)}{!workspace.settings.scope_confirmed_at ? <details className={`${styles.outputCard} disclosure`} open={!workspace.outputs.length}><summary>Add a planned output</summary><OutputForm projectId={workspace.project.id} /></details> : <p className={styles.meta}>Reopen scope from Brief to add agreed work. Submitted version content is preserved.</p>}</section>}
    {tab === "outputs" && <RestoreRecords projectId={workspace.project.id} kind="output" records={workspace.archivedOutputs.map((item) => ({ id: item.id, label: `${item.title} · v${item.revision}` }))} />}
    {tab === "shoot" && <>{shootsContent}<section className={styles.outputCard}><h3>{workspace.settings.shoot_completed_at ? "Production completion recorded" : "When the shoot is complete"}</h3>{workspace.settings.shoot_completed_at ? <p className={styles.meta}>Recorded {recordTime(workspace.settings.shoot_completed_at)}. Output reviews remain independent.</p> : <ProductionMutationForm action={productionAction} className="workflowForm"><Hidden projectId={workspace.project.id} intent="shoot" /><label className="workflowCheck"><input type="checkbox" name="confirmed" required />The planned production has actually taken place.</label><button className="button buttonPrimary" type="submit" disabled={!workspace.settings.scope_confirmed_at || !workspace.shoots.length}>Record production complete</button><p className="fieldHint">Record scope confirmation and schedule a shoot first.</p></ProductionMutationForm>}</section></>}
    {tab === "shoot" && <RestoreRecords projectId={workspace.project.id} kind="shoot" records={workspace.archivedShoots.map((item) => ({ id: item.id, label: `${item.shoot_date} · ${item.location}` }))} />}
    {tab === "shoot" && ["lead", "proposed", "booked", "on_hold"].includes(workspace.project.status) && <section className={styles.outputCard}><h3>Ready to open production?</h3><p className="fieldHint">Confirm scope and record any required production advance in Payments. This covers the materials, equipment and location commitments you agreed.</p><ProductionMutationForm action={productionAction} className="workflowForm"><Hidden projectId={workspace.project.id} intent="start_production" /><button className="button buttonPrimary" type="submit">Start production phase</button></ProductionMutationForm></section>}
    {tab === "payments" && <PaymentWorkspace projectId={workspace.project.id} plan={workspace.paymentPlan} />}
    {tab === "client" && <ClientPreview workspace={workspace} />}
    {tab === "work" && <><section className={styles.outputCard}><h3>Open the editing phase</h3><p className="fieldHint">Record shoot completion where scheduled, confirm the scope, and record the agreed post-production advance before editing begins.</p><ProductionMutationForm action={productionAction} className="workflowForm"><Hidden projectId={workspace.project.id} intent="start_post" /><button className="button buttonPrimary" type="submit" disabled={["post_production", "completed"].includes(workspace.project.status)}>Start post-production phase</button></ProductionMutationForm></section>{workContent}</>}
    {tab === "work" && <RestoreRecords projectId={workspace.project.id} kind="task" records={workspace.archivedTasks.map((item) => ({ id: item.id, label: item.title }))} />}
    {(tab === "review" || tab === "delivery") && <>
      {selected ? <><div className={styles.picker}><label htmlFor="working-output">Working on<select id="working-output" className="select" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{workspace.outputs.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><span>{approved}/{workspace.outputs.length} approved · {delivered}/{workspace.outputs.length} delivered</span></div>
        {tab === "review" ? <OutputReview key={`${selected.id}:${selected.revision}`} workspace={workspace} output={selected} /> : <article className={styles.outputCard}><span className="eyebrow">One handover at a time</span><div className={styles.cardTop}><h2>{selected.title} · v{selected.revision}</h2><span className="statusBadge">{outputLabel(selected)}</span></div><OutputLink link={selected.current.link} /><p className={styles.meta}>{selected.current.delivered_at ? `Delivery recorded ${recordTime(selected.current.delivered_at)}` : "Delivery needs approval of this exact version."}</p>{!selected.current.delivered_at && <ProductionMutationForm action={productionAction} className="workflowForm"><Hidden projectId={workspace.project.id} intent="decision" output={selected} /><input type="hidden" name="decision_kind" value="deliver" /><button className="button buttonPrimary" type="submit" disabled={selected.current.review_status !== "approved"}>Record output delivered</button></ProductionMutationForm>}<p className="fieldHint">This records external handover. It does not mark an invoice paid.</p></article>}
      </> : <div className="emptyState"><h3>Define the first output</h3><p>Add an output from Outputs before starting review.</p></div>}
      {tab === "delivery" && <section className={styles.outputCard}><h3>{workspace.readyToWrap ? "Everything agreed has been delivered." : "Keep the remaining outputs in view."}</h3><p className={styles.meta}>{delivered} of {workspace.outputs.length} active outputs delivered.</p><ProductionMutationForm action={productionAction} className="workflowForm"><Hidden projectId={workspace.project.id} intent="wrap" /><button className="button buttonPrimary" type="submit" disabled={!workspace.readyToWrap || workspace.project.status === "completed"}>{workspace.project.status === "completed" ? "Project wrapped" : "Wrap project"}</button></ProductionMutationForm></section>}
    </>}
    {tab === "history" && <section className={styles.outputCard}><span className="eyebrow">A clear record</span><h2>Project decisions and activity</h2><p className={styles.meta}>Entries are recorded by the local operator. They are not independently verified client signatures.</p>{workspace.events.length ? workspace.events.map((item) => <div className={styles.historyRow} key={item.id}><div><strong>{eventLabels[item.kind] || item.kind}{item.revision ? ` · v${item.revision}` : ""}</strong>{item.deliverable_id && <p>{workspace.outputs.find((output) => output.id === item.deliverable_id)?.title || "Archived output"}</p>}{item.details && <p>{item.details}</p>}{item.attributed_to && <p>Reported client: {item.attributed_to}</p>}</div><time dateTime={item.created_at}>{recordTime(item.created_at)}</time></div>) : <p className={styles.meta}>No workflow decisions recorded yet. Existing data was preserved without inventing history.</p>}</section>}
  </>;
}
