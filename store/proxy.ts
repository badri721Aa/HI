// STUB — owned by the platform builder (locale negotiation + geo cookie).
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/en";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/"] };
