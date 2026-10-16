import { requireOwnerPage } from "@/lib/access/server";
import type { Metadata } from "next";
import Link from "next/link";
import { CreateClientForm } from "../client-controls";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireOwnerPage();
  return (
    <main className="page">
      <header className="pageHeader">
        <div><span className="eyebrow">New relationship</span><h1 className="pageTitle">Add a client</h1><p className="pageLead">Start with the essentials. You can refine the client profile later.</p></div>
        <div className="pageActions"><Link href="/clients" className="button buttonQuiet">Back to clients</Link></div>
      </header>
      <CreateClientForm />
    </main>
  );
}
