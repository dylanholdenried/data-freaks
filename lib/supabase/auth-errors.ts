import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";

/**
 * True only when Auth says the session is really gone: no session at all, or a
 * 4xx from the Auth API (revoked / expired refresh token, deleted user).
 * Timeouts, 5xx, and HTML error pages from an overloaded Supabase are
 * transient and must not be treated as signed out.
 */
export function isDefinitiveAuthFailure(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true;
  if (!isAuthApiError(error)) return false;
  const status = error.status ?? 0;
  return status >= 400 && status < 500;
}
