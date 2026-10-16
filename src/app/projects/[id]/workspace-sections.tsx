import Link from "next/link";
import { currencyExponent, formatMoney, supportedCurrencies } from "@/lib/operations/money";
import {
  DELIVERABLE_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PRIORITY_LABELS,
  REVIEW_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from "@/lib/operations/presentation";
import {
  deliverableTypes,
  invoiceStatuses,
  reviewStatuses,
  taskPriorities,
  taskStatuses,
  userPaymentStatuses,
  type Deliverable,
  type Invoice,
  type Quote,
  type Shoot,
  type Task,
} from "@/lib/operations/schema";
import {
  createDeliverableAction,
  createInvoiceAction,
  createShootAction,
  createTaskAction,
  updateDeliverableAction,
  updateInvoiceAction,
  updateShootAction,
  updateTaskAction,
  upsertQuoteAction,
} from "../actions";
import styles from "./project-detail.module.css";

function SectionHeading({ title, description, actionLabel }: { title: string; description: string; actionLabel: string }) {
  return (
    <div className={styles.sectionHeading}>
      <div><h2>{title}</h2><p>{description}</p></div>
      <span>{actionLabel}</span>
    </div>
  );
}

export function ShootsSection({ projectId, shoots }: { projectId: string; shoots: Shoot[] }) {
  return (
    <section className={styles.workspaceSection} id="shoots">
      <SectionHeading title="Shoots" description="Production dates, call times and locations." actionLabel={`${shoots.length} scheduled`} />
      <div className={styles.itemList}>
        {shoots.map((shoot) => (
          <article className={styles.item} key={shoot.id}>
            <div className={styles.itemLead}>
              <div><strong>{shoot.shoot_date}</strong><span>{shoot.call_time_local ? `Call ${shoot.call_time_local}` : "Call time not set"}</span></div>
              <span className="statusBadge" data-tone="accent">Production</span>
            </div>
            <p>{shoot.location} <span className="muted">· {shoot.location_tz}</span></p>
            {shoot.crew_notes && <p className={styles.itemNotes}>{shoot.crew_notes}</p>}
            <details className="disclosure">
              <summary>Edit shoot</summary>
              <form action={updateShootAction} className={styles.compactForm}>
                <input type="hidden" name="id" value={shoot.id} />
                <input type="hidden" name="project_id" value={projectId} />
                <label>Date<input className="input" type="date" name="shoot_date" required defaultValue={shoot.shoot_date} /></label>
                <label>Call time<input className="input" type="time" name="call_time_local" defaultValue={shoot.call_time_local ?? ""} /></label>
                <label>Timezone<input className="input" name="location_tz" required defaultValue={shoot.location_tz} /></label>
                <label>Location<input className="input" name="location" required defaultValue={shoot.location} /></label>
                <label className={styles.wide}>Crew notes<textarea className="textarea" name="crew_notes" defaultValue={shoot.crew_notes ?? ""} /></label>
                <button className="button buttonSecondary" type="submit">Save shoot</button>
              </form>
            </details>
          </article>
        ))}
        {shoots.length === 0 && <div className={styles.miniEmpty}>No shoot scheduled. Add the first production date below.</div>}
      </div>
      <details className={styles.addDisclosure}>
        <summary>Add a shoot</summary>
        <form action={createShootAction} className={styles.compactForm}>
          <input type="hidden" name="project_id" value={projectId} />
          <label>Date<input className="input" type="date" name="shoot_date" required /></label>
          <label>Call time<input className="input" type="time" name="call_time_local" /></label>
          <label>Timezone<input className="input" name="location_tz" required defaultValue="Europe/Paris" /></label>
          <label>Location<input className="input" name="location" required placeholder="Venue, studio or address" /></label>
          <label className={styles.wide}>Crew notes<textarea className="textarea" name="crew_notes" /></label>
          <button className="button buttonPrimary" type="submit">Schedule shoot</button>
        </form>
      </details>
    </section>
  );
}

export function TasksSection({ projectId, tasks }: { projectId: string; tasks: Task[] }) {
  const openCount = tasks.filter((task) => task.status !== "done").length;
  return (
    <section className={styles.workspaceSection} id="tasks">
      <SectionHeading title="Work" description="Only the tasks that help move this production forward." actionLabel={`${openCount} open`} />
      <div className={styles.itemList}>
        {tasks.map((task) => (
          <article className={styles.item} key={task.id} data-muted={task.status === "done"}>
            <div className={styles.itemLead}>
              <div><strong>{task.title}</strong><span>{task.due_date ? `Due ${task.due_date}` : "No due date"}</span></div>
              <span className="statusBadge" data-tone={task.status === "blocked" ? "danger" : task.status === "done" ? "success" : undefined}>{TASK_STATUS_LABELS[task.status]}</span>
            </div>
            {task.description && <p className={styles.itemNotes}>{task.description}</p>}
            <form action={updateTaskAction} className={styles.inlineAction}>
              <input type="hidden" name="id" value={task.id} />
              <input type="hidden" name="project_id" value={projectId} />
              <input type="hidden" name="title" value={task.title} />
              <input type="hidden" name="description" value={task.description ?? ""} />
              <input type="hidden" name="priority" value={task.priority} />
              <input type="hidden" name="due_date" value={task.due_date ?? ""} />
              <select className="select" name="status" defaultValue={task.status} aria-label={`Status for ${task.title}`}>
                {taskStatuses.map((status) => <option value={status} key={status}>{TASK_STATUS_LABELS[status]}</option>)}
              </select>
              <button className="button buttonSecondary" type="submit">Update</button>
            </form>
            <details className="disclosure">
              <summary>Edit task</summary>
              <form action={updateTaskAction} className={styles.compactForm}>
                <input type="hidden" name="id" value={task.id} />
                <input type="hidden" name="project_id" value={projectId} />
                <label>Task<input className="input" name="title" required defaultValue={task.title} /></label>
                <label>Priority<select className="select" name="priority" defaultValue={task.priority}>{taskPriorities.map((value) => <option value={value} key={value}>{PRIORITY_LABELS[value]}</option>)}</select></label>
                <label>Due date<input className="input" type="date" name="due_date" defaultValue={task.due_date ?? ""} /></label>
                <label>Status<select className="select" name="status" defaultValue={task.status}>{taskStatuses.map((value) => <option value={value} key={value}>{TASK_STATUS_LABELS[value]}</option>)}</select></label>
                <label className={styles.wide}>Details<textarea className="textarea" name="description" defaultValue={task.description ?? ""} /></label>
                <button className="button buttonSecondary" type="submit">Save task</button>
              </form>
            </details>
          </article>
        ))}
        {tasks.length === 0 && <div className={styles.miniEmpty}>No production tasks yet.</div>}
      </div>
      <details className={styles.addDisclosure}>
        <summary>Add a task</summary>
        <form action={createTaskAction} className={styles.compactForm}>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="status" value="todo" />
          <label>Task<input className="input" name="title" required placeholder="Confirm crew, prepare cards, finish rough cut…" /></label>
          <label>Priority<select className="select" name="priority" defaultValue="normal">{taskPriorities.map((value) => <option value={value} key={value}>{PRIORITY_LABELS[value]}</option>)}</select></label>
          <label>Due date<input className="input" type="date" name="due_date" /></label>
          <label className={styles.wide}>Details<textarea className="textarea" name="description" /></label>
          <button className="button buttonPrimary" type="submit">Add task</button>
        </form>
      </details>
    </section>
  );
}

export function DeliverablesSection({ projectId, deliverables }: { projectId: string; deliverables: Deliverable[] }) {
  return (
    <section className={styles.workspaceSection} id="post">
      <SectionHeading title="Post & review" description="Edits, handoffs and client review state." actionLabel={`${deliverables.length} deliverables`} />
      <div className={styles.itemList}>
        {deliverables.map((item) => (
          <article className={styles.item} key={item.id}>
            <div className={styles.itemLead}>
              <div><strong>{item.title}</strong><span>{DELIVERABLE_TYPE_LABELS[item.type]} · Revision {item.revision}</span></div>
              <span className="statusBadge" data-tone={item.review_status === "changes_requested" ? "danger" : item.review_status === "approved" ? "success" : "accent"}>{REVIEW_STATUS_LABELS[item.review_status]}</span>
            </div>
            <p>{item.due_date ? `Due ${item.due_date}` : "No due date"}{item.link ? <> · <Link className="subtleLink" href={item.link} target="_blank" rel="noreferrer">Open file</Link></> : null}</p>
            <details className="disclosure">
              <summary>Update deliverable</summary>
              <form action={updateDeliverableAction} className={styles.compactForm}>
                <input type="hidden" name="id" value={item.id} /><input type="hidden" name="project_id" value={projectId} />
                <label>Title<input className="input" name="title" required defaultValue={item.title} /></label>
                <label>Type<select className="select" name="type" defaultValue={item.type}>{deliverableTypes.map((value) => <option value={value} key={value}>{DELIVERABLE_TYPE_LABELS[value]}</option>)}</select></label>
                <label>Review state<select className="select" name="review_status" defaultValue={item.review_status}>{reviewStatuses.map((value) => <option value={value} key={value}>{REVIEW_STATUS_LABELS[value]}</option>)}</select></label>
                <label>Revision<input className="input" name="revision" type="number" min="1" defaultValue={item.revision} /></label>
                <label>Due date<input className="input" name="due_date" type="date" defaultValue={item.due_date ?? ""} /></label>
                <label>External link<input className="input" name="link" type="url" defaultValue={item.link ?? ""} /></label>
                <label className={styles.wide}>Notes<textarea className="textarea" name="notes" defaultValue={item.notes ?? ""} /></label>
                <button className="button buttonSecondary" type="submit">Save deliverable</button>
              </form>
            </details>
          </article>
        ))}
        {deliverables.length === 0 && <div className={styles.miniEmpty}>Nothing in post yet. Add the first expected output.</div>}
      </div>
      <details className={styles.addDisclosure}>
        <summary>Add a deliverable</summary>
        <form action={createDeliverableAction} className={styles.compactForm}>
          <input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="review_status" value="not_submitted" /><input type="hidden" name="revision" value="1" />
          <label>Title<input className="input" name="title" required placeholder="Rough cut, 30s social edit…" /></label>
          <label>Type<select className="select" name="type" defaultValue="rough_cut">{deliverableTypes.map((value) => <option value={value} key={value}>{DELIVERABLE_TYPE_LABELS[value]}</option>)}</select></label>
          <label>Due date<input className="input" name="due_date" type="date" /></label>
          <label>External link<input className="input" name="link" type="url" placeholder="https://…" /></label>
          <label className={styles.wide}>Notes<textarea className="textarea" name="notes" /></label>
          <button className="button buttonPrimary" type="submit">Add deliverable</button>
        </form>
      </details>
    </section>
  );
}

export function MoneySection({ projectId, quote, invoices }: { projectId: string; quote: Quote | null; invoices: Invoice[] }) {
  return (
    <section className={styles.workspaceSection} id="money">
      <SectionHeading title="Money" description="Quote visibility and the invoices still in motion." actionLabel={`${invoices.filter((item) => item.payment_status !== "paid" && item.invoice_status !== "void").length} open`} />
      <div className={styles.moneySplit}>
        <div className={styles.quoteBlock}>
          <span className="eyebrow">Quote</span>
          {quote ? <><strong>{formatMoney(quote.amount_minor_units, quote.currency)}</strong><p>{quote.valid_until ? `Valid until ${quote.valid_until}` : "No expiry date"}</p></> : <p className="muted">No quote recorded.</p>}
          <details className="disclosure">
            <summary>{quote ? "Edit quote" : "Add quote"}</summary>
            <form action={upsertQuoteAction} className={styles.compactForm}>
              <input type="hidden" name="project_id" value={projectId} />
              <label>Amount<input className="input" name="amount" inputMode="decimal" required defaultValue={quote ? quote.amount_minor_units / 10 ** currencyExponent(quote.currency) : ""} /></label>
              <label>Currency<select className="select" name="currency" defaultValue={quote?.currency ?? "EUR"}>{supportedCurrencies.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
              <label>Valid until<input className="input" name="valid_until" type="date" defaultValue={quote?.valid_until ?? ""} /></label>
              <label className={styles.wide}>Notes<textarea className="textarea" name="notes" defaultValue={quote?.notes ?? ""} /></label>
              <button className="button buttonSecondary" type="submit">Save quote</button>
            </form>
          </details>
        </div>
        <div className={styles.invoiceList}>
          {invoices.map((invoice) => (
            <article className={styles.invoice} key={invoice.id}>
              <div className={styles.itemLead}><div><strong>{invoice.reference}</strong><span>{formatMoney(invoice.amount_minor_units, invoice.currency)}</span></div><span className="statusBadge" data-tone={invoice.payment_status === "overdue" ? "danger" : invoice.payment_status === "paid" ? "success" : "warning"}>{PAYMENT_STATUS_LABELS[invoice.payment_status]}</span></div>
              <p>{INVOICE_STATUS_LABELS[invoice.invoice_status]} · {invoice.payment_due_date ? `Due ${invoice.payment_due_date}` : "No due date"}</p>
              <details className="disclosure">
                <summary>Update invoice</summary>
                <InvoiceForm projectId={projectId} invoice={invoice} action={updateInvoiceAction} submitLabel="Save invoice" />
              </details>
            </article>
          ))}
          {invoices.length === 0 && <div className={styles.miniEmpty}>No invoices recorded.</div>}
          <details className={styles.addDisclosure}>
            <summary>Add an invoice</summary>
            <InvoiceForm projectId={projectId} action={createInvoiceAction} submitLabel="Add invoice" />
          </details>
        </div>
      </div>
    </section>
  );
}

function InvoiceForm({ projectId, invoice, action, submitLabel }: { projectId: string; invoice?: Invoice; action: (formData: FormData) => Promise<never>; submitLabel: string }) {
  return (
    <form action={action} className={styles.compactForm}>
      <input type="hidden" name="project_id" value={projectId} />{invoice && <input type="hidden" name="id" value={invoice.id} />}
      <label>Reference<input className="input" name="reference" required defaultValue={invoice?.reference ?? ""} placeholder="INV-2026-001" /></label>
      <label>Amount<input className="input" name="amount" inputMode="decimal" required defaultValue={invoice ? invoice.amount_minor_units / 10 ** currencyExponent(invoice.currency) : ""} /></label>
      <label>Currency<select className="select" name="currency" defaultValue={invoice?.currency ?? "EUR"}>{supportedCurrencies.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
      <label>Invoice status<select className="select" name="invoice_status" defaultValue={invoice?.invoice_status ?? "draft"}>{invoiceStatuses.map((value) => <option value={value} key={value}>{INVOICE_STATUS_LABELS[value]}</option>)}</select></label>
      <label>Payment status<select className="select" name="payment_status" defaultValue={invoice?.payment_status === "overdue" ? "unpaid" : invoice?.payment_status ?? "unpaid"}>{userPaymentStatuses.map((value) => <option value={value} key={value}>{PAYMENT_STATUS_LABELS[value]}</option>)}</select></label>
      <label>Issue date<input className="input" name="date_issued" type="date" defaultValue={invoice?.date_issued ?? ""} /></label>
      <label>Payment due<input className="input" name="payment_due_date" type="date" defaultValue={invoice?.payment_due_date ?? ""} /></label>
      <label className={styles.wide}>Notes<textarea className="textarea" name="notes" defaultValue={invoice?.notes ?? ""} /></label>
      <button className="button buttonSecondary" type="submit">{submitLabel}</button>
    </form>
  );
}
