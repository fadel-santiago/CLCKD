import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DashboardView } from "@/app/page";
import type { DashboardData } from "@/lib/operations/repository";

const emptyDashboard: DashboardData = {
  today: "2026-09-23",
  upcomingWindowDays: 14,
  activeProjects: [],
  upcomingShoots: [],
  overdueTasks: [],
  reviewQueue: [],
  moneyDue: [],
};

describe("home page", () => {
  it("renders the production question as its heading", () => {
    const html = renderToStaticMarkup(<DashboardView dashboard={emptyDashboard} />);
    expect(html).toContain("What needs your attention?");
  });

  it("renders exactly one h1 element", () => {
    const html = renderToStaticMarkup(<DashboardView dashboard={emptyDashboard} />);
    const matches = html.match(/<h1[\s>]/g);
    expect(matches).toHaveLength(1);
  });

  it("wraps content in a <main> landmark", () => {
    const html = renderToStaticMarkup(<DashboardView dashboard={emptyDashboard} />);
    expect(html.startsWith("<main")).toBe(true);
    expect(html.endsWith("</main>")).toBe(true);
  });
});
