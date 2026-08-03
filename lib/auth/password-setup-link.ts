import type { createSupabaseServiceClient } from "@/lib/supabase/service";

function authRedirectBase() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Build an invite/reset URL for /set-password.
 *
 * Important: we do NOT verify the recovery OTP on GET. Corporate email scanners
 * (Safe Links, Proofpoint, etc.) prefetch invite URLs and would burn a one-time
 * token before the user opens the email. The token is verified only when the user
 * submits the set-password form.
 *
 * admin.generateLink() does NOT produce PKCE `?code=` redirects. We embed
 * hashed_token + type on our own URL instead of using the raw action_link.
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
    email: email.trim().toLowerCase(),
  });

  return {
    ok: true,
    actionLink: `${authRedirectBase()}/set-password?${params.toString()}`,
  };
}
