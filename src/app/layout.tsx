import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppChrome } from "./app-chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Today | CLCKD", template: "%s | CLCKD" },
  description: "A calm production workspace for independent filmmakers and photographers.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>
    <AppChrome>{children}</AppChrome>
  </body></html>;
}
