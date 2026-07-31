import { NextResponse } from "next/server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

/**
 * Supabase Auth redirect target for invite / recovery links.
 * Exchanges ?code= for a session, then sends the user to ?next= (default /set-password).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next") || "/set-password";
  const next = nextRaw.startsWith("/") ? nextRaw : "/set-password";

  if (code) {
    const supabase = createSupabaseRouteHandlerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const login = new URL("/login", url.origin);
      login.searchParams.set("error", "auth_callback_failed");
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
