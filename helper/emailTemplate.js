// =====================================================================
// helper/emailTemplate.js
// OTP mail (helper/otp.js) jaisa hi Gmail friendly branded layout,
// baaki mails (comic approved ...) ke liye.
// =====================================================================

const path = require("path");

const SUPPORT_EMAIL = "notifications@kridemy.com";
const LOGO_CID = "kridemy-logo";
const LOGO_PATH = path.join(__dirname, "..", "public", "images", "email-logo.png");
const FRONTEND_URL = (process.env.FRONTEND_URL || "https://kridemy.com").replace(/\/+$/, "");

const escapeHtml = (text = "") =>
    String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const FONT = "font-family:Arial,Helvetica,sans-serif;";

// bodyHtml: card ke beech ka content (pehle se escaped HTML)
const buildBrandedEmail = ({ title, preheader, bodyHtml }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F4F6;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">
        <tr>
          <td style="height:6px;background:#6A11CB;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 32px 8px;">
            <img src="cid:${LOGO_CID}" width="143" height="60" alt="Kridemy" style="display:block;border:0;outline:none;width:143px;height:60px;">
          </td>
        </tr>
        ${bodyHtml}
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #E5E7EB;${FONT}text-align:center;">
            <p style="margin:0 0 4px;font-size:12px;line-height:18px;color:#6B7280;">Need help? Write to us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#6A11CB;text-decoration:none;">${SUPPORT_EMAIL}</a></p>
            <p style="margin:0;font-size:12px;line-height:18px;color:#9CA3AF;">&copy; ${new Date().getFullYear()} Kridemy &middot; Smarter Every Scroll</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

const logoAttachment = () => [{ filename: "kridemy-logo.png", path: LOGO_PATH, cid: LOGO_CID }];

// Comic publish / admin approve hone pe user ko mail
// Return: nodemailer ke liye { subject, text, html, attachments }
const buildComicApprovedEmail = ({ name, comicTitle, comicId }) => {
    const safeName = escapeHtml((name || "").trim()) || "there";
    const safeTitle = escapeHtml(comicTitle || "Your comic");
    const comicUrl = comicId ? `${FRONTEND_URL}/my-comics-details/${comicId}` : `${FRONTEND_URL}/my-comics`;
    const bundleUrl = `${FRONTEND_URL}/mybundleList`;
    const subject = "Your Comic Has Been Approved! 🎉";

    const step = (icon, text) => `
              <tr>
                <td width="28" valign="top" style="padding:4px 0;font-size:16px;line-height:22px;">${icon}</td>
                <td style="padding:4px 0;${FONT}font-size:14px;line-height:22px;color:#374151;">${text}</td>
              </tr>`;

    const bodyHtml = `
        <tr>
          <td style="padding:8px 32px 0;${FONT}text-align:center;">
            <div style="font-size:40px;line-height:48px;">&#127881;</div>
            <h1 style="margin:4px 0 12px;font-size:22px;line-height:30px;color:#111827;font-weight:700;">Congratulations!</h1>
            <p style="margin:0 0 6px;font-size:15px;line-height:24px;color:#374151;">Hi ${safeName},</p>
            <p style="margin:0;font-size:15px;line-height:24px;color:#4B5563;">Your comic has been <strong style="color:#16A34A;">published and approved</strong>.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 4px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F0FF;border:2px solid #6A11CB;border-radius:12px;">
              <tr>
                <td style="padding:16px 18px;${FONT}text-align:center;">
                  <p style="margin:0 0 4px;font-size:11px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:#6A11CB;font-weight:700;">&#128218; Your comic</p>
                  <p style="margin:0;font-size:16px;line-height:24px;color:#111827;font-weight:700;">${safeTitle}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:22px 32px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="border-radius:999px;background:#6A11CB;">
                  <a href="${comicUrl}" style="display:inline-block;padding:13px 30px;${FONT}font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">View My Comic</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F9FAFB;border-radius:10px;">
              <tr>
                <td style="padding:14px 16px;">
                  <p style="margin:0 0 6px;${FONT}font-size:13px;line-height:20px;color:#111827;font-weight:700;">What's next?</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${step("&#127760;", "It's now live in the public comics section.")}
                    ${step("&#128230;", `Add it to your <a href="${bundleUrl}" style="color:#6A11CB;text-decoration:none;font-weight:700;">bundles</a> and share it with students.`)}
                    ${step("&#128640;", "Keep creating great educational comics!")}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

    const text = [
        `Hi ${(name || "").trim() || "there"},`,
        "",
        `Congratulations! Your comic "${comicTitle || "Your comic"}" has been published and approved.`,
        "",
        `View it here: ${comicUrl}`,
        "",
        "What's next?",
        "- It's now live in the public comics section.",
        `- Add it to your bundles and share it with students: ${bundleUrl}`,
        "- Keep creating great educational comics!",
        "",
        `Need help? ${SUPPORT_EMAIL}`,
        "Team Kridemy"
    ].join("\n");

    return {
        subject,
        text,
        html: buildBrandedEmail({
            title: subject,
            preheader: `"${comicTitle || "Your comic"}" is now live on Kridemy.`,
            bodyHtml
        }),
        attachments: logoAttachment()
    };
};

module.exports = {
    escapeHtml,
    buildBrandedEmail,
    buildComicApprovedEmail
};
