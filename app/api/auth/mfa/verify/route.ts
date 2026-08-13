import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIpFromRequest, rateLimit } from "@/lib/rate-limit";
import { isOwnerAdmin } from "@/lib/roles";
import { loadActiveProfileRole } from "@/lib/mfa";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

const schema = z.object({
  factorId: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req);
  const limited = rateLimit(`auth:mfa-verify:${ip}`, 10, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many codes tried. Wait a minute and try again." },
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
    return NextResponse.json({ error: "MFA is only required for the owner account." }, { status: 403 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await req.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid code";
    return NextResponse.json({ error: message ?? "Invalid code" }, { status: 400 });
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.factorId,
    code: parsed.code,
  });

  if (error) {
    return NextResponse.json(
      { error: "That code is not valid. Try the current code from your authenticator app." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, next: "/app" });
}
