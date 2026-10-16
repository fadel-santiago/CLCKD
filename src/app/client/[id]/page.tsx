import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AccessDenied, type ClientProjectSnapshot } from "@/lib/access/repository";
import { accessRepository, CLIENT_COOKIE, requestOrigin } from "@/lib/access/server";
import { GuestProject } from "../guest-project";
export const dynamic = "force-dynamic";
export const metadata = { title: "Client project", robots: { index: false, follow: false } };
export default async function ClientProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requestOrigin(); const { id } = await params;
  let snapshot: ClientProjectSnapshot;
  try {
    snapshot = accessRepository().guestProject((await cookies()).get(CLIENT_COOKIE)?.value, id);
  } catch (error) { if (error instanceof AccessDenied) notFound(); throw error; }
  return <GuestProject snapshot={snapshot} />;
}
