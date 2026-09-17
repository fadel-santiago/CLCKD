/**
 * Production Batch 2D1 — visible read-only clients page.
 *
 * - Async server component: no client-side component, no direct SQLite access.
 * - `dynamic = "force-dynamic"` keeps this page out of static generation so
 *   clients are always read at request time.
 * - Data comes from `getApplicationClientRepository()` (the single
 *   application database entry point).
 * - Read-only for now: no forms, no mutation controls, no raw IDs.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { getApplicationClientRepository } from "@/lib/db/application";
import styles from "./clients.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clients | CLCKD",
};

const KIND_LABELS: Record<string, string> = {
  person: "Person",
  organization: "Organization",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string | string[] | null }>;
}) {
  const params = await searchParams;
  const showArchived = params.archived === "1";

  const repository = getApplicationClientRepository();
  const allClients = repository.listClients({ includeArchived: true });

  const activeClients = allClients.filter((client) => client.archived_at === null);
  const archivedClients = allClients.filter((client) => client.archived_at !== null);
  const visibleClients = showArchived ? allClients : activeClients;

  const viewLabel = showArchived ? "active and archived" : "active";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brandRow}>
            <span className={styles.brand}>CLCKD</span>
            <nav className={styles.nav} aria-label="Primary">
              <Link href="/" className={styles.navLink}>
                Home
              </Link>
            </nav>
          </div>
          <div className={styles.intro}>
            <h1 className={styles.title}>Clients</h1>
            <p className={styles.description}>
              The people and organizations you film for — who to contact, how to
              reach them, and where they are based. Everything on this page is
              read-only for now.
            </p>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section aria-label="Client counts" className={styles.summary}>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Active clients</span>
            <span className={styles.summaryValue}>{activeClients.length}</span>
          </div>
          <div className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Archived clients</span>
            <span className={styles.summaryValue}>{archivedClients.length}</span>
          </div>
        </section>

        <div className={styles.toolbar}>
          <h2 className={styles.viewHeading}>
            Showing {visibleClients.length} {visibleClients.length === 1 ? "client" : "clients"}
            <span className={styles.viewNote}> · {viewLabel}</span>
          </h2>
          <nav className={styles.toggle} aria-label="Client archive view">
            <Link
              href="/clients"
              className={styles.toggleLink}
              aria-current={!showArchived ? "page" : undefined}
              data-active={!showArchived}
            >
              Active
            </Link>
            <Link
              href="/clients?archived=1"
              className={styles.toggleLink}
              aria-current={showArchived ? "page" : undefined}
              data-active={showArchived}
            >
              All
            </Link>
          </nav>
        </div>

        {visibleClients.length === 0 ? (
          <section className={styles.empty} aria-label="No clients in this view">
            <h2 className={styles.emptyTitle}>
              {showArchived ? "No clients yet" : "No active clients yet"}
            </h2>
            <p className={styles.emptyBody}>
              {showArchived
                ? "When your clients are added, they will appear here as cards with their contact details."
                : "When you add your first client, they will appear here as a card with their contact details."}
            </p>
            <p className={styles.emptyHint}>
              Adding and editing clients arrives in a later release.
            </p>
          </section>
        ) : (
          <section aria-label={`Clients (${viewLabel})`} className={styles.grid}>
            {visibleClients.map((client) => {
              const isArchived = client.archived_at !== null;
              const location = [
                client.city,
                client.country,
              ]
                .filter((part): part is string => part !== null && part !== "")
                .join(", ");

              return (
                <article
                  key={client.id}
                  className={styles.card}
                  data-archived={isArchived}
                >
                  <div className={styles.cardHead}>
                    <h3 className={styles.cardName}>{client.name}</h3>
                    <span className={styles.cardStatus} data-archived={isArchived}>
                      {isArchived ? "Archived" : "Active"}
                    </span>
                  </div>

                  <dl className={styles.cardDetails}>
                    <div className={styles.detailRow}>
                      <dt className={styles.detailLabel}>Type</dt>
                      <dd className={styles.detailValue}>
                        {KIND_LABELS[client.kind] ?? client.kind}
                      </dd>
                    </div>
                    {client.preferred_contact_name !== null && (
                      <div className={styles.detailRow}>
                        <dt className={styles.detailLabel}>Contact</dt>
                        <dd className={styles.detailValue}>
                          {client.preferred_contact_name}
                        </dd>
                      </div>
                    )}
                    {client.email !== null && (
                      <div className={styles.detailRow}>
                        <dt className={styles.detailLabel}>Email</dt>
                        <dd className={styles.detailValue}>{client.email}</dd>
                      </div>
                    )}
                    {client.phone !== null && (
                      <div className={styles.detailRow}>
                        <dt className={styles.detailLabel}>Phone</dt>
                        <dd className={styles.detailValue}>
                          <span dir="ltr">{client.phone}</span>
                        </dd>
                      </div>
                    )}
                    {location !== "" && (
                      <div className={styles.detailRow}>
                        <dt className={styles.detailLabel}>Based in</dt>
                        <dd className={styles.detailValue}>{location}</dd>
                      </div>
                    )}
                  </dl>
                </article>
              );
            })}
          </section>
        )}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>CLCKD — management software for videographers.</span>
          <Link href="/" className={styles.footerLink}>
            Back to home
          </Link>
        </div>
      </footer>
    </div>
  );
}
