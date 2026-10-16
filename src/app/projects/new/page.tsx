import { requireOwnerPage } from "@/lib/access/server";
import type { Metadata } from "next";
import Link from "next/link";
import { getApplicationClientRepository } from "@/lib/db/application";
import { ProductionForm } from "../production-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; client?: string }>;
}) {
  await requireOwnerPage();
  const params = await searchParams;
  const clients = getApplicationClientRepository().listClients();
  return (
    <main className="page">
      <header className="pageHeader">
        <div>
          <span className="eyebrow">New work</span>
          <h1 className="pageTitle">Give the work a home.</h1>
          <p className="pageLead">Define the production and its outputs. Save it once, then keep the whole job moving here.</p>
        </div>
        <div className="pageActions"><Link href="/projects" className="button buttonQuiet">Back to projects</Link></div>
      </header>
      {params.error && <p className="notice" data-kind="error">{params.error}</p>}
      <ProductionForm clients={clients} defaultClientId={params.client} />
    </main>
  );
}
