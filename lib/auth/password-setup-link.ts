import type { createSupabaseServiceClient } from "@/lib/supabase/service";

function authRedirectBase() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Build an invite/reset URL that our /auth/callback can verify with verifyOtp.
 *
 * admin.generateLink() does NOT produce PKCE `?code=` redirects. Using the raw
 * action_link lands on /auth/callback without a code (tokens are often in the hash,
 * which the server never sees). Instead we embed hashed_token + type on our own URL.
 */
export async function generatePasswordSetupLink(
  service: ReturnType<typeof createSupabaseServiceClient>,
  email: string
): Promise<{ ok: true; actionLink: string } | { ok: false; error: string }> {
  const { data, error } = await service.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) {
    return { ok: false, error: error?.message || "Could not generate password link" };
  }

  const params = new URLSearchParams({
    token_hash: hashedToken,
    type: "recovery",
    next: "/set-password",
  });

  return {
    ok: true,
    actionLink: `${authRedirectBase()}/auth/callback?${params.toString()}`,
  };
}
