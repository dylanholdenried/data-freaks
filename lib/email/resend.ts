import { Resend } from "resend";
import { escapeHtml, renderDealerAcqEmail, siteUrl } from "@/lib/email/layout";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }
  return new Resend(apiKey);
}

function fromAddress() {
  return process.env.EMAIL_FROM || "DealerACQ <onboarding@dealeracq.com>";
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
      subject: "Your DealerACQ account is active",
      html: renderDealerAcqEmail({
        title: "Welcome to DealerACQ",
        bodyHtml: `
          <p style="margin:0 0 12px;">Hi ${escapeHtml(input.firstName)},</p>
          <p style="margin:0 0 12px;">
            <strong style="color:#FFB020;">${escapeHtml(input.groupName)}</strong> is active. You can sign in and finish setting up
            your stores (salespeople, finance managers, acquisition sources, and goals).
          </p>
        `,
        ctaLabel: "Sign in",
        ctaHref: loginUrl,
      }),
      text: `Hi ${input.firstName},\n\n${input.groupName} is active on DealerACQ.\nSign in: ${loginUrl}\n\n© DealerACQ · dealeracq.com\n`,
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
      subject: "Your DealerACQ account is ready",
      html: renderDealerAcqEmail({
        title: "You're ready to log in",
        bodyHtml: `
          <p style="margin:0 0 12px;">Hi ${escapeHtml(input.firstName || "there")},</p>
          <p style="margin:0 0 12px;">
            An account has been set up for you on <strong style="color:#FFB020;">${escapeHtml(input.groupName)}</strong>.
            Click below to create your password and sign in.
          </p>
        `,
        ctaLabel: "Create password & log in",
        ctaHref: input.actionLink,
      }),
      text: `Hi ${input.firstName || "there"},\n\nYour DealerACQ account for ${input.groupName} is ready.\nCreate your password and log in:\n${input.actionLink}\n\n© DealerACQ · dealeracq.com\n`,
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
      subject: "Reset your DealerACQ password",
      html: renderDealerAcqEmail({
        title: "Reset your password",
        bodyHtml: `
          <p style="margin:0 0 12px;">Hi ${escapeHtml(input.firstName || "there")},</p>
          <p style="margin:0 0 12px;">
            A password reset was requested for your DealerACQ account. Click below to choose a new password.
          </p>
        `,
        ctaLabel: "Reset password",
        ctaHref: input.actionLink,
        footerNote: "If you did not expect this email, you can ignore it.",
      }),
      text: `Hi ${input.firstName || "there"},\n\nReset your DealerACQ password:\n${input.actionLink}\n\nIf you did not expect this, ignore this email.\n\n© DealerACQ · dealeracq.com\n`,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to send password reset email" };
  }
}
