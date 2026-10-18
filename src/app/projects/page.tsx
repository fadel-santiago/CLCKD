import { OwnerOnly } from "@/app/demo-viewer";
import { requireWorkspaceRead } from "@/lib/access/server";
import type { Metadata } from "next";
import Link from "next/link";
import { getApplicationOperationsRepository } from "@/lib/db/application";
import { formatCalendarDate } from "@/lib/operations/dates";
import { formatMoney } from "@/lib/operations/money";
import { PROJECT_STATUS_LABELS, projectStatusTone } from "@/lib/operations/presentation";
import styles from "./projects.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; notice?: string }>;
}) {
  await requireWorkspaceRead();
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const projects = getApplicationOperationsRepository().listProjects({ includeArchived: showArchived });
  const visible = showArchived ? projects : projects.filter((project) => project.archived_at === null);

  return (
    <main className="page">
      <header className="pageHeader">
        <div>
          <span className="eyebrow">Production slate</span>
          <h1 className="pageTitle">Projects</h1>
          <p className="pageLead">Every job from first conversation through production, post and payment.</p>
        </div>
        <div className="pageActions">
          <Link href={showArchived ? "/projects" : "/projects?archived=1"} className="button buttonQuiet">
            {showArchived ? "Active projects" : "Include archived"}
          </Link>
          <OwnerOnly><Link href="/projects/new" className="button buttonPrimary">New project</Link></OwnerOnly>
        </div>
      </header>

      {params.notice && <p className="notice">{params.notice}</p>}

      {visible.length === 0 ? (
        <section className="emptyState">
          <h3>{showArchived ? "No projects recorded" : "Your production slate is clear"}</h3>
          <p>Create a project to connect a client, schedule production and keep the job moving.</p>
          <div className="formActions"><OwnerOnly><Link href="/projects/new" className="button buttonPrimary">Start a project</Link></OwnerOnly></div>
        </section>
      ) : (
        <section className={styles.grid} aria-label="Projects">
          {visible.map((project) => (
            <Link href={`/projects/${project.id}`} className={styles.card} key={project.id}>
              <div className={styles.cardTop}>
                <span className="statusBadge" data-tone={projectStatusTone(project.status)}>{PROJECT_STATUS_LABELS[project.status]}</span>
                {project.archived_at && <span className="statusBadge">Archived</span>}
              </div>
              <div>
                <h2 className={styles.title}>{project.title}</h2>
                <p className={styles.client}>{project.client_name}</p>
              </div>
              <div className={styles.meta}>
                <span>{project.start_date ? formatCalendarDate(project.start_date) : "Date not set"}</span>
                <span>{project.location ?? "Location not set"}</span>
              </div>
              {project.budget_minor_units !== null && project.budget_currency && (
                <span className={styles.budget}>{formatMoney(project.budget_minor_units, project.budget_currency)}</span>
              )}
              <span className={styles.open}>Open production <span aria-hidden="true">↗</span></span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
