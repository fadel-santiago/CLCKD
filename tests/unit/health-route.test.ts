import { describe, expect, it } from "vitest";

import { GET } from "@/app/health/route";

describe("GET /health", () => {
  it("returns HTTP 200", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it("returns the fixed JSON body", async () => {
    const response = await GET();
    const body: unknown = await response.json();
    expect(body).toEqual({ status: "ok", service: "videographer-manager" });
  });

  it("sets a JSON content type", async () => {
    const response = await GET();
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
