import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

async function equalSecret(left: string, right: string) {
  const values = await Promise.all([left, right].map((value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
  const a = new Uint8Array(values[0]);
  const b = new Uint8Array(values[1]);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export async function proxy(request: NextRequest) {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password.length < 16) {
    return new NextResponse("Admin access is not configured", { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const expected = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  if (!await equalSecret(authorization, expected)) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Basic realm="Festival Admin", charset="UTF-8"',
      },
    });
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
