import { requireOwnerPage } from "@/lib/access/server";
import { accessRepository, ownerToken } from "@/lib/access/server";
import { InvitationPanel } from "../invitation-panel";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getApplicationOperationsRepository, getApplicationProductionRepository } from "@/lib/db/application";
import { recordId } from "@/lib/production/schema";
import { archiveProjectAction, unarchiveProjectAction } from "../actions";
import { ProductionWorkspaceView } from "../production-workspace";
import { MoneySection, ShootsSection, TasksSection } from "./workspace-sections";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await requireOwnerPage();
  const { id } = await params;
  const project = getApplicationOperationsRepository().getProject(id);
  return { title: project?.title ?? "Project" };
}

export default async function ProjectDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string; tab?: string }>;
}) {
  await requireOwnerPage();
  const { id } = await params;
  if (!recordId.safeParse(id).success) notFound();
  const query = await searchParams;
  const workspace = getApplicationProductionRepository().getWorkspace(id);
  if (!workspace) notFound();
  const operations = getApplicationOperationsRepository();
  const archived = workspace.project.archived_at !== null;
  return <main className="page focusPage">
    {query.notice && <p className="notice" role="status">{query.notice}</p>}
    {query.error && <p className="notice" data-kind="error" role="alert">{query.error}</p>}
    {archived ? <section className="emptyState"><span className="eyebrow">Archived production</span><h1 className="pageTitle">{workspace.project.title}</h1><p>This project and its production records remain stored. Restore the parent, then restore its archived records individually.</p></section> :
      <ProductionWorkspaceView workspace={workspace} initialTab={query.tab}
        shootsContent={<ShootsSection projectId={id} shoots={workspace.shoots} />}
        workContent={<TasksSection projectId={id} tasks={workspace.tasks} />}
        commercialContent={<MoneySection projectId={id} quote={operations.getQuote(id)} invoices={operations.listInvoices(id)} />} />}
    {!archived && <InvitationPanel projectId={id} outputs={workspace.outputs.map((item) => ({id:item.id,title:item.title}))} invitations={accessRepository().listInvitations(await ownerToken(), id)} />}
    <details className="projectRetention disclosure">
      <summary>{archived ? "Restore project" : "Project archive controls"}</summary>
      <form action={archived ? unarchiveProjectAction : archiveProjectAction}>
        <input type="hidden" name="id" value={id} />
        <p className="fieldHint">Archiving retains project history and production data. Restoring a parent does not automatically restore children.</p>
        <button className={`button ${archived ? "buttonSecondary" : "buttonDanger"}`} type="submit">{archived ? "Restore project" : "Archive this project"}</button>
      </form>
    </details>
  </main>;
}
