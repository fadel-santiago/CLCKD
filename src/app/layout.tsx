import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppChrome } from "./app-chrome";
import { WorkspaceViewerProvider } from "./demo-viewer";
import { isReadOnlyDemo } from "@/lib/access/demo-mode";
import { requireWorkspaceRead } from "@/lib/access/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Today | CLCKD", template: "%s | CLCKD" },
  description: "A calm production workspace for independent filmmakers and photographers.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Normal-mode authentication stays in the existing page guards. Demo UI
  // state is supplied only after the existing server validation succeeds.
  const viewer = isReadOnlyDemo() ? (await requireWorkspaceRead()).role : "owner";
  return <html lang="en"><body>
    <WorkspaceViewerProvider viewer={viewer}><AppChrome>{children}</AppChrome></WorkspaceViewerProvider>
  </body></html>;
}
