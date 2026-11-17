import { NextResponse } from "next/server";
import { clientIpFromRequest, rateLimit } from "@/lib/rate-limit";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import {
  isValidVin,
  normalizeVin,
  parseNhtsaVinResults,
  VinDecodeError,
} from "@/lib/vehicle";

const NHTSA_TIMEOUT_MS = 12_000;

export async function GET(req: Request) {
  try {
    const supabase = createSupabaseRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in to decode a VIN." }, { status: 401 });
    }

    const ip = clientIpFromRequest(req);
    const userLimit = rateLimit(`vin:decode:user:${user.id}`, 40, 60_000);
    const ipLimit = rateLimit(`vin:decode:ip:${ip}`, 60, 60_000);
    if (!userLimit.ok || !ipLimit.ok) {
      const retryAfterSec = Math.max(userLimit.retryAfterSec, ipLimit.retryAfterSec);
      return NextResponse.json(
        { error: "Too many VIN decode requests. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
      );
    }

    const vin = normalizeVin(new URL(req.url).searchParams.get("vin") ?? "");
    if (!isValidVin(vin)) {
      return NextResponse.json(
        { error: "VIN must be 17 characters to decode." },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NHTSA_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`,
        { signal: controller.signal, headers: { Accept: "application/json" } }
      );
    } catch {
      return NextResponse.json(
        { error: "Couldn't reach the VIN decoder — try again in a moment." },
        { status: 502 }
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not decode this VIN — enter details manually." },
        { status: 502 }
      );
    }

    const json = (await res.json()) as {
      Results?: { Variable: string; Value: string | null }[];
    };
    const decoded = parseNhtsaVinResults(json.Results ?? []);
    return NextResponse.json(decoded);
  } catch (err) {
    if (err instanceof VinDecodeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("GET /api/vin/decode", err);
    return NextResponse.json(
      { error: "Could not decode this VIN — enter details manually." },
      { status: 500 }
    );
  }
}
