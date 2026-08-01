import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";

const schema = z.object({
  confirmedEmail: z.string().email(),
  password: z.string().min(8),
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Set password for the invite/recovery session user, then activate invited → active.
 * Uses the same route-handler cookie pattern as /api/auth/login (avoids Server Action
 * "fetch failed" when cookie writes throw).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.parse(body);
    const confirmedEmail = normalizeEmail(parsed.confirmedEmail);

    const supabase = createSupabaseRouteHandlerClient();
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
