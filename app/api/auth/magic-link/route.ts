import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

const schema = z.object({
  email: z.string().email()
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseRouteHandlerClient();
    const body = await req.json();
    const parsed = schema.parse(body);

    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.email,
      options: {
        emailRedirectTo: process.env.NEXT_PUBLIC_SITE_URL
          ? `${process.env.NEXT_PUBLIC_SITE_URL}/app`
          : undefined
      }
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/auth/magic-link", err);
    const message =
      typeof err?.message === "string" && err?.message.includes("Missing NEXT_PUBLIC")
        ? err.message
        : err?.message ?? "Invalid request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

