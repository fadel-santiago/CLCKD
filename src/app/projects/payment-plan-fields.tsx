"use client";

import { useState } from "react";
import { calculatePaymentPlan, percentageBasisPoints, type PaymentPlan } from "@/lib/production/payments";
import { currencyExponent, formatMoney, supportedCurrencies } from "@/lib/operations/money";
import styles from "./payment-plan.module.css";

type Row = { title: string; percentage: string; payment_condition: string; due_date: string | null; work_gate: "none" | "production" | "post_production" | "delivery" };
const presets: Record<string, Row[]> = {
  "50/50": [
    { title: "Booking deposit", percentage: "50", payment_condition: "Before booking equipment and commencing work", due_date: null, work_gate: "production" },
    { title: "Final delivery", percentage: "50", payment_condition: "After approval and final delivery of the agreed outputs", due_date: null, work_gate: "none" },
  ],
  "30/30/40": [
    { title: "Booking & preparation", percentage: "30", payment_condition: "Before preparation and equipment booking", due_date: null, work_gate: "production" },
    { title: "Production completed", percentage: "30", payment_condition: "After the agreed shoot is completed, before post-production begins", due_date: null, work_gate: "post_production" },
    { title: "Approved delivery", percentage: "40", payment_condition: "After approval and delivery of the agreed outputs", due_date: null, work_gate: "none" },
  ],
  "20/20/20/20/20": ["Booking", "Pre-production", "Shoot completed", "First edit", "Final delivery"].map((title, index) => ({ title, percentage: "20", payment_condition: ["Before work commences", "After approval of the production plan", "After the agreed shoot is completed", "After the first edit is submitted for review", "After approval and final delivery"][index], due_date: null, work_gate: (["production", "production", "post_production", "delivery", "none"] as const)[index] })),
};

export function PaymentPlanFields({ existing, optional = false }: { existing?: PaymentPlan | null; optional?: boolean }) {
  const [preset, setPreset] = useState(existing ? "custom" : optional ? "none" : "50/50");
  const [currency, setCurrency] = useState(existing?.currency ?? "EUR");
  const [total, setTotal] = useState(existing ? (existing.total_minor_units / 10 ** currencyExponent(existing.currency)).toFixed(currencyExponent(existing.currency)) : "");
  const [rows, setRows] = useState<Row[]>(existing?.milestones.map((item) => ({ title: item.title, percentage: String(item.basis_points / 100), payment_condition: item.payment_condition, due_date: item.due_date, work_gate: item.work_gate })) ?? presets["50/50"]);
  const enabled = preset !== "none";
  const sum = rows.reduce((value, item) => value + (/^\d{1,3}(?:\.\d{1,2})?$/.test(item.percentage) ? percentageBasisPoints(item.percentage) : 0), 0) / 100;
  let amounts: number[] = [];
  let error = "";
  if (enabled && total) {
    try { amounts = calculatePaymentPlan({ total, currency, contract_reference: null, terms: null, milestones: rows }).milestones.map((item) => item.amount_minor_units); }
    catch (value) { error = value instanceof Error ? value.message : "Check the schedule"; }
  }
  function change(index: number, patch: Partial<Row>) { setPreset("custom"); setRows(rows.map((item, position) => position === index ? { ...item, ...patch } : item)); }
  return <section className={styles.plan} aria-label="Payment and contract structure">
    <span className="eyebrow">Clear work. Clear payment.</span><h2>Payment & contract structure</h2>
    <p className="fieldHint">Agree what is due, when it is due, and what work it covers. All payments happen outside CLCKD.</p>
    <label className="field">Payment split<select className="select" value={preset} onChange={(event) => { const next = event.target.value; setPreset(next); if (presets[next]) setRows(presets[next].map((item) => ({ ...item }))); }}>
      {optional && <option value="none">Set up later</option>}<option value="50/50">50% / 50% — deposit & final delivery</option><option value="30/30/40">30% / 30% / 40% — preparation, shoot & delivery</option><option value="20/20/20/20/20">20% × 5 — five production stages</option><option value="custom">Custom milestones</option>
    </select></label>
    <input type="hidden" name="payment_enabled" value={enabled ? "yes" : "no"} />
    {enabled && <>
      <div className="formGrid"><label className="field">Total project fee<input name="payment_total" className="input" inputMode="decimal" required value={total} onChange={(event) => setTotal(event.target.value)} placeholder="e.g. 5000.00" /></label><label className="field">Currency<select className="select" name="payment_currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>{supportedCurrencies.map((value) => <option key={value}>{value}</option>)}</select></label></div>
      <p className={styles.total} role="status">Allocated: {sum}% / 100% {sum === 100 ? "✓" : "— adjust your split"}</p>
      {rows.map((item, index) => <article className={styles.milestone} key={index}>
        <div className={styles.heading}><strong>{item.percentage || "?"}% · {item.title || `Milestone ${index + 1}`}</strong><span>{amounts[index] !== undefined ? formatMoney(amounts[index], currency, "en-GB") : "Amount pending"}</span></div>
        <p className="fieldHint">{item.payment_condition || "Define the work/payment condition"} · {item.work_gate === "none" ? "Tracked without a phase gate" : `Payment required before ${item.work_gate.replaceAll("_", " ")}`}</p>
        <details className="disclosure" open={preset === "custom"}><summary>Edit milestone {index + 1}</summary>
        <div className="formGrid"><label className="field">Work stage<input className="input" name="milestone_title" required maxLength={200} value={item.title} onChange={(event) => change(index, { title: event.target.value })} /></label><label className="field">Percentage (%)<input className="input" name="milestone_percentage" type="number" min="0.01" max="100" step="0.01" required value={item.percentage} onChange={(event) => change(index, { percentage: event.target.value })} /></label><label className="fieldWide">Payment becomes due when…<textarea className="textarea" name="milestone_condition" required maxLength={1000} value={item.payment_condition} onChange={(event) => change(index, { payment_condition: event.target.value })} /></label><label className="field">Optional due date<input className="input" name="milestone_due_date" type="date" value={item.due_date ?? ""} onChange={(event) => change(index, { due_date: event.target.value || null })} /></label></div>
        <label className="field">Required before moving into<select className="select" name="milestone_work_gate" value={item.work_gate} onChange={(event) => change(index, { work_gate: event.target.value as Row["work_gate"] })}><option value="none">No phase gate (e.g. payable after delivery)</option><option value="production">Production — materials, equipment, rentals, locations</option><option value="post_production">Post-production — editing & finishing</option><option value="delivery">Final delivery — handover of approved outputs</option></select></label>
        {rows.length > 1 && <button className="button buttonQuiet" type="button" aria-label={`Remove milestone ${index + 1}`} onClick={() => { setPreset("custom"); setRows(rows.filter((_, position) => position !== index)); }}>Remove milestone</button>}</details>
      </article>)}
      <button type="button" className="button buttonSecondary" disabled={rows.length >= 20} onClick={() => { setPreset("custom"); setRows([...rows, { title: "", percentage: "", payment_condition: "", due_date: null, work_gate: "none" }]); }}>+ Add milestone</button>
      {error && <p className="notice" data-kind="error" role="status">{error}</p>}
      <details className="disclosure"><summary>Contract reference & agreed terms</summary><div className="formGrid"><label className="fieldWide">External contract reference<input name="contract_reference" className="input" maxLength={300} defaultValue={existing?.contract_reference ?? ""} placeholder="Contract number or document location" /></label><label className="fieldWide">Agreed commercial terms<textarea name="contract_terms" className="textarea" maxLength={5000} defaultValue={existing?.terms ?? ""} placeholder="Scope, payment deadlines, revision limits, cancellation and delivery conditions agreed with your client" /></label></div><p className="fieldHint">A record of your agreement—not a generated legal contract, signature or payment guarantee.</p></details>
    </>}
  </section>;
}
