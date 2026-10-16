"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductionWorkspace } from "@/lib/production/repository";
import { PaymentSummary } from "./payment-workspace";
import styles from "./payment-plan.module.css";

function webLink(link: string | null) {
  if (!link) return null;
  try { const url = new URL(link); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function ClientPreview({ workspace }: { workspace: ProductionWorkspace }) {
  const router = useRouter();
  const [selected, setSelected] = useState(workspace.outputs[0]?.id ?? "");
  useEffect(() => { const timer = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 15000); return () => window.clearInterval(timer); }, [router]);
  const outputs = workspace.outputs;
  const stages = [
    { label: "Scope agreed", done: !!workspace.settings.scope_confirmed_at },
    { label: "Shoot completed", done: !!workspace.settings.shoot_completed_at },
    { label: "Preview available", done: outputs.some((item) => !!item.current.submitted_at) },
    { label: "Outputs approved", done: outputs.length > 0 && outputs.every((item) => item.current.review_status === "approved") },
    { label: "Final delivery", done: outputs.length > 0 && outputs.every((item) => !!item.current.delivered_at) },
  ];
  const completed = stages.filter((item) => item.done).length;
  const output = outputs.find((item) => item.id === selected) ?? outputs[0];
  const href = webLink(output?.current.link ?? null);
  const directVideo = href && /\.(mp4|webm|mov)$/i.test(new URL(href).pathname);
  const labels: Record<string, string> = { production_started: "Production phase opened", post_production_started: "Editing phase opened", scope_confirmed: "Scope confirmation recorded", scope_reopened: "Scope reopened", scope_revised: "Project agreement updated", shoot_completed: "Shoot completed", review_submitted: "New creative preview submitted", output_delivered: "Output delivered", approval_recorded: "Approval recorded", approval_withdrawn: "Approval withdrawn", changes_requested: "Feedback recorded", project_wrapped: "Project wrapped" };
  const activity = workspace.events.filter((item) => item.kind in labels).slice(0, 5);
  const updateKey = `${workspace.settings.scope_revision}:${outputs.map((item) => `${item.id}:${item.revision}:${item.current.review_status}:${item.current.delivered_at}`).join("|")}:${workspace.settings.shoot_completed_at}`;
  return <section className={styles.preview} aria-label="Client project preview">
    <span className="eyebrow">Made together, step by step</span><h2>{workspace.project.title}</h2><p>Your project, in a clear picture.</p><p className={styles.note}>Read-only preview of the future client experience. This is still your local workspace—not a shared client portal. Progress is based on operator-recorded updates.</p>
    <details className="disclosure"><summary>Our project agreement, at a glance</summary><p>Commissioned by {workspace.project.client_name} · approver: {workspace.settings.approver_name || "To confirm"}</p><p className={styles.note}>Project reference: {workspace.project.id} · scope v{workspace.settings.scope_revision} · {workspace.settings.scope_confirmed_at ? "Confirmation recorded by the operator" : "Awaiting confirmation"}</p><p>Shoot: {workspace.project.start_date || "To be scheduled"} · target delivery: {workspace.project.end_date || "To confirm"}</p>{outputs.map((item) => <p key={item.id}><strong>{item.title}</strong><br />{item.quantity} × {item.format || "Specification to confirm"} · {item.revision_allowance} included revision rounds</p>)}<p className={styles.note}>Commercial terms and payment conditions appear below. This summary is not a signed contract and grants no publication rights.</p></details>
    <div className={styles.progress} role="progressbar" aria-label="Completed project checkpoints" aria-valuemin={0} aria-valuemax={5} aria-valuenow={completed} aria-valuetext={`${completed} of 5 checkpoints complete; not an estimate of work hours`}><div style={{ width: `${completed * 20}%` }} /></div><p aria-live="polite">{completed} of 5 checkpoints complete{completed === 5 ? " · Everything agreed is delivered." : " · Every clear step moves the project forward."}</p>
    <div className={styles.stages}>{stages.map((item) => <div className={`${styles.stage} ${styles.updated}`} data-done={item.done} key={`${item.label}:${item.done}`}><span aria-hidden="true">{item.done ? "✓" : "○"}</span>{item.label}<small>{item.done ? " · Recorded" : " · Not yet recorded"}</small></div>)}</div>
    <div key={updateKey} className={styles.updated}><h3>See the work taking shape</h3>{outputs.length ? <><label className="field">Preview output<select className="select" value={output.id} onChange={(event) => setSelected(event.target.value)}>{outputs.map((item) => <option key={item.id} value={item.id}>{item.title} · version {item.revision}</option>)}</select></label><article className={styles.milestone}><h3>{output.title} · v{output.revision}</h3><p>{output.quantity} × {output.format || "Specification to confirm"}</p>{href ? <><a href={href} className="button buttonPrimary" target="_blank" rel="noopener noreferrer">Open submitted preview ↗</a>{directVideo && <video key={href} controls preload="none" src={href} aria-label={`${output.title} version ${output.revision} preview`} />}<p className={styles.note}>External media is loaded only when you open the link or play a direct video. Access permissions are managed by its host.</p></> : <p className={styles.note}>Your creative preview will appear here when a review link is submitted.</p>}</article></> : <p>No outputs planned yet.</p>}</div>
    <h3>Recent progress</h3>{activity.length ? activity.map((item) => <p key={item.id} className={styles.updated}>{labels[item.kind]}{item.revision ? ` · version ${item.revision}` : ""}<br /><small className={styles.note}>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(item.created_at))} UTC</small></p>) : <p className={styles.note}>Project updates will appear here as work is recorded.</p>}
    {workspace.paymentPlan && <><h3>Our payment milestones</h3><PaymentSummary plan={workspace.paymentPlan} /></>}<p className={styles.note}>Completion does not automatically mark a payment received. This preview cannot approve work or change project records.</p>
  </section>;
}
