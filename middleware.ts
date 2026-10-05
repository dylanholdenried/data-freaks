import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isDefinitiveAuthFailure } from "@/lib/supabase/auth-errors";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** Stay well under Vercel's 25s middleware limit so a hung Auth call can't 504 the site. */
const AUTH_TIMEOUT_MS = 8_000;

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((c) => c.name.includes("-auth-token"));
}

export async function middleware(request: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }

  // No session cookies → nothing to refresh; skip the Auth round-trip.
  if (!hasSupabaseAuthCookie(request)) {
    return NextResponse.next({
      request: { headers: request.headers },
    });
  }

  // Buffer cookie writes until we know whether the Auth call succeeded, so a
  // failed refresh during a Supabase outage can't wipe a valid session.
  const pendingCookies = new Map<string, CookieToSet>();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const c of cookiesToSet) pendingCookies.set(c.name, c);
        },
      },
    }
  );

  let authError: unknown = null;
  try {
    const { error } = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("auth_timeout")), AUTH_TIMEOUT_MS)
      ),
    ]);
    authError = error;
  } catch (e) {
    authError = e;
  }

  let toApply = Array.from(pendingCookies.values());
  // A batch of only-empty values is supabase-js removing the session. Keep any
  // batch that writes a new session (it also clears stale cookie chunks).
  const isSessionRemoval = toApply.length > 0 && toApply.every((c) => c.value === "");
  if (authError && isSessionRemoval && !isDefinitiveAuthFailure(authError)) {
    toApply = [];
  }

  for (const { name, value } of toApply) {
    request.cookies.set(name, value);
  }
  const response = NextResponse.next({
    request: { headers: request.headers },
  });
  for (const { name, value, options } of toApply) {
    response.cookies.set(name, value, options);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files, images, and the /sb
     * Supabase proxy (those requests carry their own bearer token).
     */
    "/((?!_next/static|_next/image|favicon.ico|sb/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
