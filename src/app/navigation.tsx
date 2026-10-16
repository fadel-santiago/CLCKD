"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Today", glyph: "H" },
  { href: "/projects", label: "Projects", glyph: "P" },
  { href: "/clients", label: "Clients", glyph: "C" },
] as const;

export function PrimaryNavigation() {
  const pathname = usePathname();
  return (
    <nav className="primaryNav" aria-label="Primary navigation">
      <span className="navLabel">Workspace</span>
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className="navItem"
            aria-current={active ? "page" : undefined}
            data-active={active}
          >
            <span className="navGlyph" aria-hidden="true">{link.glyph}</span>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
