import { NextResponse } from "next/server";
import { clientIpFromRequest, rateLimit } from "@/lib/rate-limit";
import { isOwnerAdmin } from "@/lib/roles";
import { loadActiveProfileRole } from "@/lib/mfa";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const limited = rateLimit(`auth:mfa-enroll:${ip}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many MFA requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const supabase = createSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const role = await loadActiveProfileRole(supabase, user.id);
  if (!isOwnerAdmin(role)) {
    return NextResponse.json({ error: "MFA setup is only required for the owner account." }, { status: 403 });
  }

  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) {
    return NextResponse.json({ error: factors.error.message }, { status: 400 });
  }

  const totp = factors.data.totp ?? [];
  const verified = totp.find((f) => f.status === "verified");
  if (verified) {
    return NextResponse.json({
      mode: "verify" as const,
      factorId: verified.id,
    });
  }

  for (const factor of totp) {
    if (factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const enrolled = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "DealerACQ owner",
    issuer: "DealerACQ",
  });

  if (enrolled.error || !enrolled.data?.totp) {
    return NextResponse.json(
      { error: enrolled.error?.message ?? "Could not start authenticator setup" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    mode: "enroll" as const,
    factorId: enrolled.data.id,
    qr: enrolled.data.totp.qr_code,
    secret: enrolled.data.totp.secret,
  });
}
