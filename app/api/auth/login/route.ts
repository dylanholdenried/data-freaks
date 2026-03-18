import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  try {
    const body = await req.json();
    const parsed = loginSchema.parse(body);

    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.email,
      password: parsed.password
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

