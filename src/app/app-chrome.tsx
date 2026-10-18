"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PrimaryNavigation } from "./navigation";
import { ownerSignOutAction } from "./access/actions";
import { OwnerOnly, useDemoViewer } from "./demo-viewer";

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const demoViewer = useDemoViewer();
  const restricted = pathname.startsWith("/client/") || pathname === "/invite" || pathname.startsWith("/access");
  return <div className="focusShell"><header className="focusHeader">
    {restricted ? <span className="brandMark"><span className="brandAperture" aria-hidden="true" />CLCKD</span> : <Link href="/" className="brandMark" aria-label="CLCKD home"><span className="brandAperture" aria-hidden="true" />CLCKD</Link>}
    {!restricted && <><PrimaryNavigation /><OwnerOnly><div className="pageActions"><Link href="/projects/new" className="button buttonPrimary buttonCompact">New project ↗</Link><form action={ownerSignOutAction}><button className="button buttonQuiet buttonCompact">Sign out</button></form></div></OwnerOnly></>}
  </header><div className="workspaceContext"><span>Made for the makers</span><span>{demoViewer ? <><strong>Read-only demo</strong> · All information is fictional.</> : pathname.startsWith("/client/") ? "Assigned project · read-only client access" : "Local access pilot · no subscription billing"}</span></div><div className="pageSurface">{children}</div><footer className="focusFooter"><span>Work together. Credit everyone.</span><span>CLCKD · production management</span></footer></div>;
}
