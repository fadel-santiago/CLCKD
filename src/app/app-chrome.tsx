"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PrimaryNavigation } from "./navigation";
import { ownerSignOutAction } from "./access/actions";

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const restricted = pathname.startsWith("/client/") || pathname === "/invite" || pathname.startsWith("/access");
  return <div className="focusShell"><header className="focusHeader">
    {restricted ? <span className="brandMark"><span className="brandAperture" aria-hidden="true" />CLCKD</span> : <Link href="/" className="brandMark" aria-label="CLCKD home"><span className="brandAperture" aria-hidden="true" />CLCKD</Link>}
    {!restricted && <><PrimaryNavigation /><div className="pageActions"><Link href="/projects/new" className="button buttonPrimary buttonCompact">New project ↗</Link><form action={ownerSignOutAction}><button className="button buttonQuiet buttonCompact">Sign out</button></form></div></>}
  </header><div className="workspaceContext"><span>Made for the makers</span><span>{pathname.startsWith("/client/") ? "Assigned project · read-only client access" : "Local access pilot · no subscription billing"}</span></div><div className="pageSurface">{children}</div><footer className="focusFooter"><span>Work together. Credit everyone.</span><span>CLCKD · production management</span></footer></div>;
}
