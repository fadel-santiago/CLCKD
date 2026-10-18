"use client";
import { createContext, useContext, type ReactNode } from "react";

type Viewer = "owner" | "demo_viewer";
// Presentation only. Server page/action guards remain the authorization boundary.
const ViewerContext = createContext<Viewer>("demo_viewer");

export function WorkspaceViewerProvider({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useDemoViewer(): boolean {
  return useContext(ViewerContext) === "demo_viewer";
}

export function OwnerOnly({ children }: { children: ReactNode }) {
  return useDemoViewer() ? null : children;
}
