import { requireWorkspaceRead } from "@/lib/access/server";
import Link from "next/link";
import { getApplicationOperationsRepository, getApplicationProductionRepository } from "@/lib/db/application";
import { formatCalendarDate } from "@/lib/operations/dates";
import { PROJECT_STATUS_LABELS, REVIEW_STATUS_LABELS } from "@/lib/operations/presentation";
import type { DashboardData } from "@/lib/operations/repository";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export function DashboardView({ dashboard }: { dashboard: DashboardData }) {
  const first = dashboard.activeProjects[0];
  const reviews = dashboard.reviewQueue;
  return <main className="page focusPage">
    <header className="pageHeader">
      <div><span className="eyebrow focusSticker">Made for the makers</span><h1 className="pageTitle">A clear head.<br />A little creative momentum.</h1><p className="pageLead">Your next good step is right here. Let’s make room for the work.</p></div>
    </header>
    <section className={styles.focusCover} aria-label="Current production">
      <div className="sectionHeader"><span className="eyebrow">{first ? "Your current production" : "Room for something good"}</span>{first && <span className="statusBadge">{PROJECT_STATUS_LABELS[first.status]}</span>}</div>
      <h2>{first?.title ?? "Give your next project a home."}</h2>
      <p>{first ? first.client_name : "Start with a brief, define the outputs and keep every decision connected to the work."}</p>
      {first ? <div className="formActions"><Link className="button buttonPrimary" href={`/projects/${first.id}`}>Open production ↗</Link><Link className="button buttonSecondary" href="/projects">View all projects</Link></div> : <div className="formActions"><Link className="button buttonPrimary" href="/projects/new">Create a production ↗</Link></div>}
    </section>
    <section className="section"><div className="sectionHeader"><h2 className="sectionTitle">What needs your attention?</h2><span className="sectionMeta">{dashboard.activeProjects.length} active projects · {reviews.length} outputs in review</span></div>
      <div className={styles.focusGrid}>
        <section className="panel panelPad"><span className="eyebrow">On the horizon</span><h3>Upcoming shoots</h3>{dashboard.upcomingShoots.length ? dashboard.upcomingShoots.map((shoot) => <Link key={shoot.id} className={styles.focusRow} href={`/projects/${shoot.project_id}?tab=shoot`}><strong>{shoot.project_title}</strong><span>{formatCalendarDate(shoot.shoot_date)} · {shoot.call_time_local || "Call time not set"}</span><span>{shoot.location}</span></Link>) : <p className="muted">Schedule a shoot from its project when you know the date.</p>}</section>
        <section className="panel panelPad"><span className="eyebrow">One version. One decision.</span><h3>Review queue</h3>{reviews.length ? reviews.map((item) => <Link key={item.id} className={styles.focusRow} href={`/projects/${item.project_id}?tab=review`}><strong>{item.title}</strong><span>{item.project_title} · v{item.revision}</span><span>{REVIEW_STATUS_LABELS[item.review_status]}</span></Link>) : <p className="muted">No output is waiting on review. Submitted versions will appear here.</p>}</section>
      </div>
    </section>
    {dashboard.activeProjects.length > 1 && <section className="section"><h2 className="sectionTitle">Also on your slate</h2>{dashboard.activeProjects.slice(1).map((item) => <Link key={item.id} href={`/projects/${item.id}`} className={styles.focusRow}><strong>{item.title}</strong><span>{item.client_name} · {PROJECT_STATUS_LABELS[item.status]}</span></Link>)}</section>}
    {dashboard.overdueTasks.length > 0 && <section className="section"><h2 className="sectionTitle">Work to follow up</h2>{dashboard.overdueTasks.map((task) => <Link className={styles.focusRow} key={task.id} href={`/projects/${task.project_id}?tab=work`}><strong>{task.title}</strong><span>{task.project_title} · due {task.due_date}</span></Link>)}</section>}
  </main>;
}

export default async function HomePage() {
  await requireWorkspaceRead();
  getApplicationProductionRepository();
  return <DashboardView dashboard={getApplicationOperationsRepository().getDashboard()} />;
}
