import { requireOwnerPage } from "@/lib/access/server";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getApplicationClientRepository,
  getApplicationOperationsRepository,
} from "@/lib/db/application";
import { ClientArchiveControl } from "./client-controls";
import styles from "./clients.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  await requireOwnerPage();
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const clients = getApplicationClientRepository().listClients({ includeArchived: true });
  const projects = getApplicationOperationsRepository().listProjects({ includeArchived: true });
  const visible = showArchived ? clients : clients.filter((client) => client.archived_at === null);
  const projectCounts = new Map<string, number>();
  for (const project of projects) projectCounts.set(project.client_id, (projectCounts.get(project.client_id) ?? 0) + 1);

  return (
    <main className="page">
      <header className="pageHeader">
        <div>
          <span className="eyebrow">Relationships</span>
          <h1 className="pageTitle">Clients</h1>
          <p className="pageLead">The people behind the work, with their productions one click away.</p>
        </div>
        <div className="pageActions">
          <Link href={showArchived ? "/clients" : "/clients?archived=1"} className="button buttonQuiet">{showArchived ? "Active clients" : "Include archived"}</Link>
          <Link href="/clients/new" className="button buttonPrimary">New client</Link>
        </div>
      </header>

      <section className={styles.summary} aria-label="Client summary">
        <div><span>Active</span><strong>{clients.filter((client) => client.archived_at === null).length}</strong></div>
        <div><span>Archived</span><strong>{clients.filter((client) => client.archived_at !== null).length}</strong></div>
        <div><span>Projects linked</span><strong>{projects.length}</strong></div>
      </section>

      {visible.length === 0 ? (
        <section className="emptyState"><h3>No clients in this view</h3><p>Add your first client, then turn the conversation into a project.</p><div className="formActions"><Link href="/clients/new" className="button buttonPrimary">Add a client</Link></div></section>
      ) : (
        <section className={styles.grid} aria-label="Clients">
          {visible.map((client) => {
            const location = [client.city, client.country].filter(Boolean).join(", ");
            const archived = client.archived_at !== null;
            return (
              <article className={styles.card} key={client.id} data-archived={archived}>
                <div className={styles.cardTop}>
                  <span className="statusBadge" data-tone={archived ? undefined : "success"}>{archived ? "Archived" : "Active"}</span>
                  <span className={styles.kind}>{client.kind === "organization" ? "Studio / brand" : "Individual"}</span>
                </div>
                <div>
                  <h2><Link href={`/clients/${client.id}`}>{client.name}</Link></h2>
                  <p>{client.preferred_contact_name ?? "No preferred contact"}</p>
                </div>
                <dl className="detailList">
                  <div><dt>Projects</dt><dd>{projectCounts.get(client.id) ?? 0}</dd></div>
                  <div><dt>Based in</dt><dd>{location || "Not recorded"}</dd></div>
                  <div><dt>Contact</dt><dd>{client.email ?? client.phone ?? "Not recorded"}</dd></div>
                </dl>
                <div className={styles.cardActions}>
                  <Link href={`/clients/${client.id}`} className="button buttonSecondary">Open client</Link>
                  <ClientArchiveControl id={client.id} archived={archived} />
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
