import { NextResponse } from "next/server";
import { z } from "zod";
import type { EmailOtpType } from "@supabase/supabase-js";
import { clientIpFromRequest, rateLimit } from "@/lib/rate-limit";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";

const OTP_TYPES = new Set<EmailOtpType>([
  "recovery",
  "invite",
  "magiclink",
  "signup",
  "email",
  "email_change",
]);

const schema = z.object({
  confirmedEmail: z.string().email(),
  password: z.string().min(8),
  token_hash: z.string().min(1).optional(),
  type: z.string().optional(),
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Set password for an invite/recovery user, then activate invited → active.
 *
 * Prefers verifying token_hash on POST (not GET) so corporate email scanners
 * cannot burn the one-time recovery link by prefetching the invite URL.
 * Falls back to an existing recovery session when token_hash is absent.
 */
export async function POST(req: Request) {
  try {
    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`auth:set-password:${ip}`, 10, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
      );
    }

    const body = await req.json();
    const parsed = schema.parse(body);
    const confirmedEmail = normalizeEmail(parsed.confirmedEmail);
    const tokenHash = parsed.token_hash?.trim() || null;
    const otpType =
      parsed.type && OTP_TYPES.has(parsed.type as EmailOtpType)
        ? (parsed.type as EmailOtpType)
        : "recovery";

    const supabase = createSupabaseRouteHandlerClient();

    if (tokenHash) {
      // Clear any leftover admin/owner session before establishing the invitee session.
      await supabase.auth.signOut();

      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        type: otpType,
        token_hash: tokenHash,
      });

      if (verifyError || !verifyData.user?.email) {
        return NextResponse.json(
          {
            error:
              "This link has expired or is invalid. Ask your admin to send a new invite.",
          },
          { status: 401 }
        );
      }

      if (normalizeEmail(verifyData.user.email) !== confirmedEmail) {
        await supabase.auth.signOut();
        return NextResponse.json(
          {
            error:
              "Email does not match the account for this invite link. Check the address shown above and try again.",
          },
          { status: 400 }
        );
      }
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return NextResponse.json(
        {
          error:
            "This link has expired or is invalid. Ask your admin to send a new invite.",
        },
        { status: 401 }
      );
    }

    if (normalizeEmail(user.email) !== confirmedEmail) {
      return NextResponse.json(
        {
          error:
            "Email does not match the account for this invite link. Check the address shown above and try again.",
        },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.password,
    });

    if (updateError) {
      const msg = updateError.message ?? "";
      if (msg === "fetch failed" || /fetch failed/i.test(msg)) {
        return NextResponse.json(
          {
            error:
              "Could not reach Supabase to update your password. Try again in a moment.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // Activate invited → active for this same auth user (service role).
    const service = createSupabaseServiceClient();
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id, status")
      .or(profileMatchAuthUserId(user.id))
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.status === "invited") {
      const { error: activateError } = await service
        .from("profiles")
        .update({ status: "active" })
        .eq("id", profile.id)
        .eq("status", "invited");

      if (activateError) {
        return NextResponse.json({ error: activateError.message }, { status: 500 });
      }
    } else if (profile.status === "disabled") {
      return NextResponse.json(
        { error: "This account is disabled. Contact your admin." },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/auth/set-password", err);
    if (err?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
    }
    const message =
      err?.message === "fetch failed"
        ? "Could not reach the server. Try again."
        : err?.message ?? "Could not update password.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
