import { createBrowserClient } from "@supabase/ssr";

/** Same-origin path that next.config.mjs rewrites to the Supabase project. */
export const SUPABASE_PROXY_PATH = "/sb";

/**
 * Browsers call Supabase through our own domain so dealership firewalls,
 * DNS filters, and endpoint security that block *.supabase.co can't break
 * the app. The cookie name stays pinned to the project ref because
 * supabase-js otherwise derives it from the URL hostname, and the server
 * client and middleware read the session from that cookie.
 */
export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const url =
    typeof window === "undefined"
      ? supabaseUrl
      : `${window.location.origin}${SUPABASE_PROXY_PATH}`;

  return createBrowserClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { name: `sb-${projectRef}-auth-token` },
  });
}

const NETWORK_ERROR_PATTERN = /failed to fetch|networkerror|load failed|network request failed/i;

/** Turns browser network failures into something a store user can act on. */
export function describeError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!message) return fallback;
  if (NETWORK_ERROR_PATTERN.test(message)) {
    return "Couldn't reach the server — check your internet connection and try again.";
  }
  return message;
}
