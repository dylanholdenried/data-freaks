import { Resend } from "resend";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }
  return new Resend(apiKey);
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function fromAddress() {
  return process.env.EMAIL_FROM || "Data Freaks <onboarding@datafreaks.app>";
}

export type ActivationEmailInput = {
  to: string;
  firstName: string;
  groupName: string;
};

export async function sendActivationEmail(
  input: ActivationEmailInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loginUrl = `${siteUrl()}/login`;

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: input.to,
      subject: "Your Data Freaks account is active",
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #0f172a;">
          <h1 style="font-size: 20px; margin: 0 0 12px;">Welcome to Data Freaks</h1>
          <p style="margin: 0 0 12px;">Hi ${escapeHtml(input.firstName)},</p>
          <p style="margin: 0 0 12px;">
            <strong>${escapeHtml(input.groupName)}</strong> is active. You can sign in and finish setting up
            your stores (salespeople, finance managers, acquisition sources, and goals).
          </p>
          <p style="margin: 0 0 20px;">
            <a href="${loginUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">
              Sign in
            </a>
          </p>
          <p style="margin: 0; font-size: 13px; color: #64748b;">
            If the button does not work, open: ${loginUrl}
          </p>
        </div>
      `,
      text: `Hi ${input.firstName},\n\n${input.groupName} is active on Data Freaks.\nSign in: ${loginUrl}\n`,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to send activation email" };
  }
}

export type InviteEmailInput = {
  to: string;
  firstName: string;
  groupName: string;
  actionLink: string;
};

/** New or moved user: set password and sign in. */
export async function sendInviteEmail(
  input: InviteEmailInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: input.to,
      subject: "Your Data Freaks account is ready",
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #0f172a;">
          <h1 style="font-size: 20px; margin: 0 0 12px;">You're ready to log in</h1>
          <p style="margin: 0 0 12px;">Hi ${escapeHtml(input.firstName || "there")},</p>
          <p style="margin: 0 0 12px;">
            An account has been set up for you on <strong>${escapeHtml(input.groupName)}</strong>.
            Click below to create your password and sign in.
          </p>
          <p style="margin: 0 0 20px;">
            <a href="${escapeHtml(input.actionLink)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">
              Create password &amp; log in
            </a>
          </p>
          <p style="margin: 0; font-size: 13px; color: #64748b;">
            If the button does not work, open:<br/>${escapeHtml(input.actionLink)}
          </p>
        </div>
      `,
      text: `Hi ${input.firstName || "there"},\n\nYour Data Freaks account for ${input.groupName} is ready.\nCreate your password and log in:\n${input.actionLink}\n`,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to send invite email" };
  }
}

export type PasswordResetEmailInput = {
  to: string;
  firstName: string;
  actionLink: string;
};

export async function sendPasswordResetEmail(
  input: PasswordResetEmailInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: input.to,
      subject: "Reset your Data Freaks password",
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #0f172a;">
          <h1 style="font-size: 20px; margin: 0 0 12px;">Reset your password</h1>
          <p style="margin: 0 0 12px;">Hi ${escapeHtml(input.firstName || "there")},</p>
          <p style="margin: 0 0 12px;">
            A password reset was requested for your Data Freaks account. Click below to choose a new password.
          </p>
          <p style="margin: 0 0 20px;">
            <a href="${escapeHtml(input.actionLink)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">
              Reset password
            </a>
          </p>
          <p style="margin: 0; font-size: 13px; color: #64748b;">
            If you did not expect this email, you can ignore it.<br/>
            If the button does not work, open:<br/>${escapeHtml(input.actionLink)}
          </p>
        </div>
      `,
      text: `Hi ${input.firstName || "there"},\n\nReset your Data Freaks password:\n${input.actionLink}\n\nIf you did not expect this, ignore this email.\n`,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to send password reset email" };
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
