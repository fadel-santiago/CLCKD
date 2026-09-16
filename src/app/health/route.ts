import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type HealthStatus = "ok";

const HEALTH_STATUS: HealthStatus = "ok";
const SERVICE_NAME = "videographer-manager";

/**
 * GET /health — liveness probe (used by the M4 G4 gate).
 * Returns HTTP 200 with a fixed JSON body.
 */
export function GET() {
  return NextResponse.json({
    status: HEALTH_STATUS,
    service: SERVICE_NAME,
  });
}
