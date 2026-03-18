import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.string().email()
});

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  try {
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
    console.error(err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

