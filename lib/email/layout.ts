function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Colored 3a wordmark as email-safe nested tables (blue ACQ, red→amber→green tape). */
function emailLogoHtml() {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
      <tr>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;letter-spacing:-1px;line-height:1;color:#E8ECF2;">Dealer</td>
        <td style="font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;letter-spacing:-1px;line-height:1;color:#4A9EFF;">ACQ</td>
      </tr>
      <tr>
        <td colspan="2" style="padding-top:8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="height:2px;background:#3A4252;font-size:0;line-height:0;">&nbsp;</td>
              <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
              <td width="28" valign="bottom" style="background:#FF5A52;font-size:0;line-height:0;">
                <div style="height:4px;line-height:4px;font-size:4px;">&nbsp;</div>
              </td>
              <td width="4" style="font-size:0;line-height:0;">&nbsp;</td>
              <td width="28" valign="bottom" style="background:#FFB020;font-size:0;line-height:0;">
                <div style="height:8px;line-height:8px;font-size:8px;">&nbsp;</div>
              </td>
              <td width="4" style="font-size:0;line-height:0;">&nbsp;</td>
              <td width="28" valign="bottom" style="background:#2ECC71;font-size:0;line-height:0;">
                <div style="height:12px;line-height:12px;font-size:12px;">&nbsp;</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

export type EmailLayoutInput = {
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaHref: string;
  footerNote?: string;
};

export function renderDealerAcqEmail(input: EmailLayoutInput): string {
  const year = new Date().getFullYear();
  const footerNote = input.footerNote
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#8B93A7;">${input.footerNote}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#0B0E13;color:#E8ECF2;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0B0E13;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#12161F;border:1px solid #1E2531;border-radius:12px;">
          <tr>
            <td style="padding:32px 28px 28px;font-family:Arial,Helvetica,sans-serif;color:#E8ECF2;">
              ${emailLogoHtml()}
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;font-weight:700;color:#E8ECF2;">
                ${escapeHtml(input.title)}
              </h1>
              <div style="font-size:15px;line-height:1.6;color:#E8ECF2;">
                ${input.bodyHtml}
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
                <tr>
                  <td style="border-radius:8px;background:#4A9EFF;">
                    <a href="${escapeHtml(input.ctaHref)}" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
                      ${escapeHtml(input.ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#8B93A7;">
                If the button does not work, open:<br />
                <a href="${escapeHtml(input.ctaHref)}" style="color:#4A9EFF;word-break:break-all;">${escapeHtml(input.ctaHref)}</a>
              </p>
              ${footerNote}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #1E2531;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#8B93A7;">
              © ${year} DealerACQ · <a href="https://dealeracq.com" style="color:#8B93A7;text-decoration:none;">dealeracq.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export { escapeHtml, siteUrl };
