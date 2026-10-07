import type { NextRequest } from "next/server";
import { countryToRegion } from "@/lib/geo";

/** Visitor country from Vercel's edge geo header (null locally). Never cached. */
export async function GET(request: NextRequest) {
  const country = request.headers.get("x-vercel-ip-country");
  return Response.json(
    { country, region: countryToRegion(country) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
