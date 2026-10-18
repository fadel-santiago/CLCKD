import { OwnerOnly } from "@/app/demo-viewer";
import { requireWorkspaceRead } from "@/lib/access/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getApplicationClientRepository,
  getApplicationOperationsRepository,
} from "@/lib/db/application";
import { PROJECT_STATUS_LABELS, projectStatusTone } from "@/lib/operations/presentation";
import { updateClientAction } from "./actions";
import styles from "../clients.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requireWorkspaceRead();
  const { id } = await params;
  return { title: getApplicationClientRepository().getClientById(id)?.name ?? "Client" };
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireWorkspaceRead();
  const { id } = await params;
  const query = await searchParams;
  const client = getApplicationClientRepository().getClientById(id);
  if (client === null) notFound();
  const projects = getApplicationOperationsRepository().listProjects({ includeArchived: true, clientId: id });

  return (
    <main className="page">
      <header className="pageHeader">
        <div><Link href="/clients" className={styles.back}>Clients /</Link><span className="eyebrow">{client.kind === "organization" ? "Organisation" : "Individual"}</span><h1 className="pageTitle">{client.name}</h1><p className="pageLead">{client.preferred_contact_name ? `Primary contact: ${client.preferred_contact_name}` : "Client profile and production history."}</p></div>
        <div className="pageActions"><OwnerOnly><Link href={`/projects/new?client=${client.id}`} className="button buttonPrimary">New project</Link></OwnerOnly></div>
      </header>
      {query.notice && <p className="notice">{query.notice}</p>}{query.error && <p className="notice" data-kind="error">{query.error}</p>}

      <section className={styles.detailGrid}>
        <div className="panel panelPad">
          <span className="eyebrow">Contact</span>
          <dl className="detailList">
            <div><dt>Email</dt><dd>{client.email ? <a className="subtleLink" href={`mailto:${client.email}`}>{client.email}</a> : "Not recorded"}</dd></div>
            <div><dt>Phone</dt><dd>{client.phone ? <a className="subtleLink" href={`tel:${client.phone}`}>{client.phone}</a> : "Not recorded"}</dd></div>
            <div><dt>Location</dt><dd>{[client.city, client.region, client.country].filter(Boolean).join(", ") || "Not recorded"}</dd></div>
            <div><dt>Projects</dt><dd>{projects.length}</dd></div>
          </dl>
          {client.notes && <p className={styles.notes}>{client.notes}</p>}
        </div>
        <OwnerOnly><div className="panel panelPad">
          <details className="disclosure">
            <summary>Edit client profile</summary>
            <form action={updateClientAction} className={styles.editForm}>
              <input type="hidden" name="id" value={client.id} />
              <label>Name<input className="input" name="name" required defaultValue={client.name} /></label>
              <label>Kind<select className="select" name="kind" defaultValue={client.kind}><option value="organization">Organisation</option><option value="person">Individual</option></select></label>
              <label>Contact name<input className="input" name="preferred_contact_name" defaultValue={client.preferred_contact_name ?? ""} /></label>
              <label>Email<input className="input" name="email" type="email" defaultValue={client.email ?? ""} /></label>
              <label>Phone<input className="input" name="phone" defaultValue={client.phone ?? ""} /></label>
              <label>City<input className="input" name="city" defaultValue={client.city ?? ""} /></label>
              <label>Region<input className="input" name="region" defaultValue={client.region ?? ""} /></label>
              <label>Country<input className="input" name="country" maxLength={2} defaultValue={client.country ?? ""} /></label>
              <label>Address<input className="input" name="address_line1" defaultValue={client.address_line1 ?? ""} /></label>
              <label>Address line 2<input className="input" name="address_line2" defaultValue={client.address_line2 ?? ""} /></label>
              <label>Postcode<input className="input" name="postal_code" defaultValue={client.postal_code ?? ""} /></label>
              <label className={styles.wide}>Notes<textarea className="textarea" name="notes" defaultValue={client.notes ?? ""} /></label>
              <button className="button buttonPrimary" type="submit">Save client</button>
            </form>
          </details>
        </div></OwnerOnly>
      </section>

      <section className="section">
        <div className="sectionHeader"><h2 className="sectionTitle">Projects</h2><span className="sectionMeta">{projects.length} linked</span></div>
        {projects.length === 0 ? <div className="emptyState"><h3>No project yet</h3><p>Turn this relationship into a production when the next job arrives.</p></div> : (
          <div className={styles.projectList}>{projects.map((project) => <Link href={`/projects/${project.id}`} key={project.id}><div><strong>{project.title}</strong><span>{project.location ?? "Location not set"}</span></div><span className="statusBadge" data-tone={projectStatusTone(project.status)}>{PROJECT_STATUS_LABELS[project.status]}</span></Link>)}</div>
        )}
      </section>
    </main>
  );
}
