import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseRouteHandlerClient();
    const body = await req.json();
    const parsed = loginSchema.parse(body);

    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.email,
      password: parsed.password
    });

    if (error) {
      // Supabase returns this when the server cannot complete HTTPS to *.supabase.co
      // (DNS, firewall, VPN, paused project, bad URL, etc.) — not "wrong password".
      const msg = error.message ?? "";
      if (
        msg === "fetch failed" ||
        /fetch failed/i.test(msg) ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("ENOTFOUND")
      ) {
        return NextResponse.json(
          {
            error:
              "Could not reach Supabase from your dev server. Check: (1) NEXT_PUBLIC_SUPABASE_URL has no typo and no trailing slash, (2) project is not paused in Supabase Dashboard, (3) VPN/firewall allows HTTPS to *.supabase.co, (4) restart `npm run dev` after changing .env.local."
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/auth/login", err);
    const message =
      typeof err?.message === "string" && err.message.includes("Missing NEXT_PUBLIC")
        ? err.message
        : err?.message === "fetch failed" || err?.cause?.code === "ECONNREFUSED"
          ? "Could not reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL in .env.local and your network."
          : err?.message ?? "Login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

