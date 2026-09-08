import { NextResponse } from "next/server";
import { applyNoStoreHeaders } from "./app/lib/cache-policy";

export function proxy() {
  const response = NextResponse.next();
  applyNoStoreHeaders(response.headers);
  return response;
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
