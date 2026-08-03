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
            <strong style="color:#4A9EFF;">${escapeHtml(input.groupName)}</strong> is active. You can sign in and finish setting up
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
            An account has been set up for you on <strong style="color:#4A9EFF;">${escapeHtml(input.groupName)}</strong>.
            Open the link below, confirm your email, and create your password to sign in.
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

export type SignupRequestNotificationInput = {
  firstName: string;
  lastName: string;
  email: string;
  title?: string | null;
  dealerGroupMode: "new" | "existing";
  dealerGroupName: string;
  numberOfStores?: number | null;
  website?: string | null;
};

function signupNotifyTo() {
  return process.env.SIGNUP_NOTIFY_EMAIL || "dylan@dealeracq.com";
}

function detailRow(label: string, value: string) {
  return `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #1E2531;font-size:13px;line-height:1.4;color:#8B93A7;width:42%;vertical-align:top;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #1E2531;font-size:14px;line-height:1.4;color:#E8ECF2;font-weight:600;vertical-align:top;">
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
}

/** Internal alert when someone submits /signup. */
export async function sendSignupRequestNotificationEmail(
  input: SignupRequestNotificationInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const requestsUrl = `${siteUrl()}/admin/requests`;
  const modeLabel =
    input.dealerGroupMode === "new"
      ? "Create new dealership/group"
      : "Access existing dealership/group";
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const title = input.title?.trim() || "—";
  const stores =
    input.dealerGroupMode === "new" && input.numberOfStores != null
      ? String(input.numberOfStores)
      : "—";
  const website =
    input.dealerGroupMode === "new" && input.website?.trim()
      ? input.website.trim()
      : "—";

  const detailRows = [
    detailRow("Name", fullName),
    detailRow("Email", input.email),
    detailRow("Title / role", title),
    detailRow("Request type", modeLabel),
    detailRow("Group name", input.dealerGroupName),
  ];
  if (input.dealerGroupMode === "new") {
    detailRows.push(detailRow("Number of stores", stores));
    detailRows.push(detailRow("Website", website));
  }

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: fromAddress(),
      to: signupNotifyTo(),
      subject: `New signup request · ${input.dealerGroupName}`,
      html: renderDealerAcqEmail({
        title: "New signup request",
        bodyHtml: `
          <p style="margin:0 0 16px;">
            A new account request was submitted on <strong style="color:#4A9EFF;">/signup</strong>.
            Review and provision access when ready.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 4px;">
            ${detailRows.join("")}
          </table>
        `,
        ctaLabel: "Review requests",
        ctaHref: requestsUrl,
      }),
      text: [
        "New DealerACQ signup request",
        "",
        `Name: ${fullName}`,
        `Email: ${input.email}`,
        `Title / role: ${title}`,
        `Request type: ${modeLabel}`,
        `Group name: ${input.dealerGroupName}`,
        ...(input.dealerGroupMode === "new"
          ? [`Number of stores: ${stores}`, `Website: ${website}`]
          : []),
        "",
        `Review: ${requestsUrl}`,
        "",
        "© DealerACQ · dealeracq.com",
      ].join("\n"),
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Failed to send signup notification email",
    };
  }
}
