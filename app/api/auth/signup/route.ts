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
  // Service-role client: must use auth.admin.createUser (not auth.signUp).
  // signUp attaches a user session on this client, so later inserts run as the
  // new user and hit profiles RLS (no public insert policy).
  const supabase = createSupabaseServiceClient();

  try {
    const body = await req.json();
    const parsed = signupSchema.parse(body);
    const email = parsed.email.trim().toLowerCase();

    // 1) Create auth user without switching the service client session
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: {
        first_name: parsed.first_name,
        last_name: parsed.last_name
      }
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    const user = createData.user;
    if (!user) {
      return NextResponse.json({ error: "User was not created" }, { status: 400 });
    }

    // 2) Create pending profile (no dealer_group_id yet) — service role bypasses RLS.
    // Use insert (not upsert on user_id): production may lack a unique constraint on user_id.
    const { error: profileError } = await supabase.from("profiles").insert({
      // Supports legacy schema where profiles.id references auth.users.id
      id: user.id,
      user_id: user.id,
      email,
      first_name: parsed.first_name,
      last_name: parsed.last_name,
      role: "store_admin",
      status: "invited"
    });

    if (profileError) {
      console.error("Error creating profile", profileError);
      // Roll back orphaned auth user so retry can succeed
      await supabase.auth.admin.deleteUser(user.id).catch(() => undefined);
      return NextResponse.json(
        { error: `Profile insert failed: ${profileError.message}` },
        { status: 500 }
      );
    }

    // 3) Register dealer group request (new or existing).
    // requested_user_id may be absent on legacy production DBs — keep the link in notes.
    const { error: requestError } = await supabase.from("dealer_group_requests").insert({
      first_name: parsed.first_name,
      last_name: parsed.last_name,
      email,
      phone: null,
      dealer_group_name:
        parsed.dealer_group_mode === "existing"
          ? parsed.dealer_group_name ?? "Existing group (ID provided)"
          : parsed.dealer_group_name ?? "New dealer group",
      title: parsed.title ?? null,
      number_of_stores: parsed.number_of_stores ?? null,
      website: parsed.website ?? null,
      status: "pending",
      notes:
        parsed.dealer_group_mode === "existing"
          ? `Requested access to existing group: ${parsed.existing_group_id ?? "no ID provided"}; auth_user_id=${user.id}`
          : `New dealer group request via signup; auth_user_id=${user.id}`
    });

    if (requestError) {
      console.error("Error creating dealer_group_request", requestError);
      // Roll back auth + profile so the email can be reused on retry
      await supabase.from("profiles").delete().eq("user_id", user.id);
      await supabase.auth.admin.deleteUser(user.id).catch(() => undefined);
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

