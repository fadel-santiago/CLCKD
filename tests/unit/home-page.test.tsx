import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

describe("home page", () => {
  it("renders the 'Videographer Manager' heading", () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html).toContain("Videographer Manager");
  });

  it("renders exactly one h1 element", () => {
    const html = renderToStaticMarkup(<HomePage />);
    const matches = html.match(/<h1[\s>]/g);
    expect(matches).toHaveLength(1);
  });

  it("wraps content in a <main> landmark", () => {
    const html = renderToStaticMarkup(<HomePage />);
    expect(html.startsWith("<main")).toBe(true);
    expect(html.endsWith("</main>")).toBe(true);
  });
});
