import { NextResponse, type NextRequest } from "next/server";
import { validateLocalOrigin } from "./lib/access/origin";

export function proxy(request: NextRequest) {
  try { validateLocalOrigin(request.headers.get("host")); }
  catch { return new NextResponse("Local access pilot only. Public sharing is not enabled.", { status: 403 }); }
  const response = NextResponse.next();
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");
  // Real authorization is in each page/data operation and every server action.
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
