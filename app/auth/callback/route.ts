import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase Auth redirect target for invite / recovery / magic links.
 *
 * Cookies are written onto the redirect NextResponse (not cookies() from next/headers),
 * and any existing session is signed out before exchanging the code — so an owner
 * still logged in on the device cannot survive into /set-password.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next") || "/set-password";
  const next = nextRaw.startsWith("/") ? nextRaw : "/set-password";
  const isSetPassword = next === "/set-password" || next.startsWith("/set-password?");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", "auth_misconfigured");
    return NextResponse.redirect(login);
  }

  // Fail closed for invite/reset: never open /set-password on a leftover session.
  if (isSetPassword && !code) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", "invite_link_invalid");
    return NextResponse.redirect(login);
  }

  if (!code) {
    return NextResponse.redirect(new URL(next, url.origin));
  }

  let redirectTarget = new URL(next, url.origin);
  const cookieBag = new Map<string, { value: string; options: CookieOptions }>();

  function buildResponse() {
    const res = NextResponse.redirect(redirectTarget);
    cookieBag.forEach(({ value, options }, name) => {
      res.cookies.set(name, value, options);
    });
    return res;
  }

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          cookieBag.set(name, { value, options });
        });
      },
    },
  });

  // Drop any existing session before establishing the invitee/recovery session.
  await supabase.auth.signOut();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirectTarget = new URL("/login", url.origin);
    redirectTarget.searchParams.set(
      "error",
      isSetPassword ? "invite_link_invalid" : "auth_callback_failed"
    );
    await supabase.auth.signOut();
    return buildResponse();
  }

  return buildResponse();
}
