import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const signupSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  dealer_group_mode: z.enum(["new", "existing"]),
  dealer_group_name: z.string().optional(),
  existing_group_id: z.string().optional(),
  title: z.string().optional(),
  number_of_stores: z.number().int().positive().optional(),
  website: z.string().min(3).optional()
});

export async function POST(req: Request) {
  const supabase = createSupabaseServiceClient();

  try {
    const body = await req.json();
    const parsed = signupSchema.parse(body);

    // 1) Create auth user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: parsed.email,
      password: parsed.password,
      options: {
        data: {
          first_name: parsed.first_name,
          last_name: parsed.last_name
        },
        emailRedirectTo: process.env.NEXT_PUBLIC_SITE_URL
          ? `${process.env.NEXT_PUBLIC_SITE_URL}/app`
          : undefined
      }
    });

    if (signUpError) {
      return NextResponse.json({ error: signUpError.message }, { status: 400 });
    }

    const user = signUpData.user;
    if (!user) {
      return NextResponse.json({ error: "User was not created" }, { status: 400 });
    }

    // 2) Create pending profile (no dealer_group_id yet)
    const { error: profileError } = await supabase.from("profiles").insert({
      user_id: user.id,
      email: parsed.email,
      first_name: parsed.first_name,
      last_name: parsed.last_name,
      role: "store_admin",
      status: "invited"
    });

    if (profileError) {
      console.error("Error creating profile", profileError);
      return NextResponse.json(
        { error: `Profile insert failed: ${profileError.message}` },
        { status: 500 }
      );
    }

    // 3) Register dealer group request (new or existing)
    const { error: requestError } = await supabase.from("dealer_group_requests").insert({
      first_name: parsed.first_name,
      last_name: parsed.last_name,
      email: parsed.email,
      phone: null,
      dealer_group_name:
        parsed.dealer_group_mode === "existing"
          ? parsed.dealer_group_name ?? "Existing group (ID provided)"
          : parsed.dealer_group_name ?? "New dealer group",
      title: parsed.title ?? null,
      number_of_stores: parsed.number_of_stores ?? null,
      website: parsed.website ?? null,
      requested_user_id: user.id,
      status: "pending",
      notes:
        parsed.dealer_group_mode === "existing"
          ? `Requested access to existing group: ${parsed.existing_group_id ?? "no ID provided"}`
          : "New dealer group request via signup"
    });

    if (requestError) {
      console.error("Error creating dealer_group_request", requestError);
      return NextResponse.json(
        { error: `Request insert failed: ${requestError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

