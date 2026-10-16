import type { Client } from "@/lib/clients/schema";
import { currencyExponent, supportedCurrencies } from "@/lib/operations/money";
import { PROJECT_STATUS_LABELS } from "@/lib/operations/presentation";
import { projectStatuses, type Project } from "@/lib/operations/schema";

export function ProjectForm({
  action,
  clients,
  defaultClientId,
  project,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<never>;
  clients: Client[];
  defaultClientId?: string;
  project?: Project;
  submitLabel: string;
}) {
  const budget =
    project?.budget_minor_units !== null && project?.budget_currency
      ? String(project.budget_minor_units / 10 ** currencyExponent(project.budget_currency))
      : "";

  return (
    <form action={action} className="formPanel">
      {project && <input type="hidden" name="id" value={project.id} />}
      <div className="formGrid">
        <div className="fieldWide">
          <label htmlFor="project-title">Project title</label>
          <input
            className="input"
            id="project-title"
            name="title"
            required
            maxLength={200}
            defaultValue={project?.title ?? ""}
            placeholder="Brand film, wedding, launch campaign…"
          />
        </div>
        <div className="field">
          <label htmlFor="project-client">Client</label>
          <select
            className="select"
            id="project-client"
            name="client_id"
            required
            defaultValue={project?.client_id ?? defaultClientId ?? clients[0]?.id ?? ""}
          >
            {clients.map((client) => (
              <option value={client.id} key={client.id}>{client.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="project-status">Production stage</label>
          <select
            className="select"
            id="project-status"
            name="status"
            defaultValue={project?.status ?? "lead"}
          >
            {projectStatuses.map((status) => (
              <option value={status} key={status}>{PROJECT_STATUS_LABELS[status]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="project-start">Start date</label>
          <input className="input" id="project-start" name="start_date" type="date" defaultValue={project?.start_date ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="project-end">Target finish</label>
          <input className="input" id="project-end" name="end_date" type="date" defaultValue={project?.end_date ?? ""} />
        </div>
        <div className="fieldWide">
          <label htmlFor="project-location">Main location</label>
          <input className="input" id="project-location" name="location" maxLength={300} defaultValue={project?.location ?? ""} placeholder="Studio, venue or city" />
        </div>
        <div className="field">
          <label htmlFor="project-budget">Budget</label>
          <input className="input" id="project-budget" name="budget_amount" inputMode="decimal" defaultValue={budget} placeholder="0.00" />
        </div>
        <div className="field">
          <label htmlFor="project-currency">Currency</label>
          <select className="select" id="project-currency" name="budget_currency" defaultValue={project?.budget_currency ?? "EUR"}>
            {supportedCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>
        </div>
        <div className="fieldWide">
          <label htmlFor="project-notes">Production notes</label>
          <textarea className="textarea" id="project-notes" name="notes" maxLength={5000} defaultValue={project?.notes ?? ""} placeholder="Scope, creative direction, constraints or next conversation" />
        </div>
      </div>
      <div className="formActions">
        <button className="button buttonPrimary" type="submit">{submitLabel}</button>
      </div>
    </form>
  );
}
