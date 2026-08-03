import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

const OTP_TYPES = new Set<EmailOtpType>([
  "recovery",
  "invite",
  "magiclink",
  "signup",
  "email",
  "email_change",
]);

/**
 * Supabase Auth redirect target for invite / recovery / magic links.
 *
 * Supports:
 * - token_hash + type for password setup: pass through to /set-password WITHOUT
 *   verifying on GET (email scanners prefetch and burn one-time OTPs)
 * - token_hash + type for other flows via verifyOtp
 * - code (PKCE) via exchangeCodeForSession
 *
 * Cookies are written onto the redirect NextResponse when a session is established.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const typeRaw = url.searchParams.get("type") || "recovery";
  const nextRaw = url.searchParams.get("next") || "/set-password";
  const next = nextRaw.startsWith("/") ? nextRaw : "/set-password";
  const isSetPassword = next === "/set-password" || next.startsWith("/set-password?");

  const otpType = OTP_TYPES.has(typeRaw as EmailOtpType)
    ? (typeRaw as EmailOtpType)
    : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", "auth_misconfigured");
    return NextResponse.redirect(login);
  }

  const hasTokenHash = Boolean(tokenHash && otpType);
  const hasCode = Boolean(code);

  // Fail closed for invite/reset: never open /set-password on a leftover session.
  if (isSetPassword && !hasTokenHash && !hasCode) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", "invite_link_invalid");
    return NextResponse.redirect(login);
  }

  // Invite/recovery password setup: do not verifyOtp on GET.
  // Scanners follow the link; verifying here would invalidate the token before the user acts.
  if (isSetPassword && hasTokenHash && tokenHash && otpType) {
    const dest = new URL("/set-password", url.origin);
    dest.searchParams.set("token_hash", tokenHash);
    dest.searchParams.set("type", otpType);
    const email = url.searchParams.get("email");
    if (email) dest.searchParams.set("email", email);
    return NextResponse.redirect(dest);
  }

  if (!hasTokenHash && !hasCode) {
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

  function failAuth() {
    redirectTarget = new URL("/login", url.origin);
    redirectTarget.searchParams.set(
      "error",
      isSetPassword ? "invite_link_invalid" : "auth_callback_failed"
    );
    return buildResponse();
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

  if (hasTokenHash && tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash: tokenHash,
    });
    if (error) {
      await supabase.auth.signOut();
      return failAuth();
    }
    return buildResponse();
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      await supabase.auth.signOut();
      return failAuth();
    }
    return buildResponse();
  }

  return failAuth();
}
