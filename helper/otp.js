// =====================================================================
// helper/otp.js
// OTP generate / limit / expiry + Gmail friendly email template.
//
// OTP 4 digit hi hai kyunki website + app ka OTP box 4 digit ka hai.
// Brute force rokne ke liye:
//   - ek OTP par max MAX_OTP_ATTEMPTS galat try
//   - OTP_SEND_WINDOW_MS ke andar max MAX_OTP_SENDS OTP bhej sakte hain
//   - OTP OTP_EXPIRY_MINUTES me expire
// =====================================================================

const crypto = require("crypto");
const path = require("path");

const OTP_EXPIRY_MINUTES = 15;
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_SENDS = 10;
const OTP_SEND_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

const SUPPORT_EMAIL = "notifications@kridemy.com";
const LOGO_CID = "kridemy-logo";
const LOGO_PATH = path.join(__dirname, "..", "public", "images", "email-logo.png");

const generateOtp = () => crypto.randomInt(1000, 10000);

const isOtpExpired = (generatedAt) => {
    if (!generatedAt) return true;
    const time = new Date(generatedAt).getTime();
    if (isNaN(time) || time <= 0) return true;
    return Date.now() - time > OTP_EXPIRY_MINUTES * 60 * 1000;
};

// Naya OTP banake save karta hai. Send limit cross ho gayi to null return.
const issueOtp = async (Users, userId) => {
    const windowStart = new Date(Date.now() - OTP_SEND_WINDOW_MS);

    // Window purani ho gayi (ya kabhi bani hi nahi) -> counter reset
    await Users.updateOne(
        { _id: userId, $or: [{ otp_window_at: null }, { otp_window_at: { $lt: windowStart } }] },
        { $set: { otp_window_at: new Date(), otp_resend: 0 } }
    );

    const otp = generateOtp();

    // Atomic: limit ke andar ho tabhi OTP set hoga
    const updated = await Users.findOneAndUpdate(
        { _id: userId, otp_resend: { $lt: MAX_OTP_SENDS } },
        {
            $inc: { otp_resend: 1 },
            $set: { otp, otp_generated_at: new Date(), otp_attempts: 0 }
        },
        { new: true }
    );

    return updated ? otp : null;
};

// Galat try count karta hai (compare se PEHLE). Limit cross -> false.
const consumeOtpAttempt = async (Users, userId) => {
    const updated = await Users.findOneAndUpdate(
        { _id: userId, otp_attempts: { $not: { $gte: MAX_OTP_ATTEMPTS } } },
        { $inc: { otp_attempts: 1 } },
        { new: true }
    );
    return !!updated;
};

const escapeHtml = (text = "") =>
    String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const EMAIL_COPY = {
    verify: {
        subject: "Your Kridemy verification code",
        heading: "Verify your email",
        intro: "Welcome to Kridemy! Use the code below to verify your email address and finish setting up your account."
    },
    reset: {
        subject: "Your Kridemy password reset code",
        heading: "Reset your password",
        intro: "We received a request to reset the password for your Kridemy account. Use the code below to continue."
    }
};

// purpose: "verify" | "reset"
// Return: nodemailer ke liye { subject, text, html, attachments }
const buildOtpEmail = ({ name, otp, purpose = "verify" }) => {
    const copy = EMAIL_COPY[purpose] || EMAIL_COPY.verify;
    const safeName = escapeHtml((name || "").trim()) || "there";
    const digits = String(otp).split("");

    const digitCells = digits
        .map((d) => `<td style="padding:0 5px;"><div style="width:52px;height:60px;line-height:60px;background:#FFF7ED;border:2px solid #F59E0B;border-radius:12px;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:700;color:#1F2937;text-align:center;">${d}</div></td>`)
        .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<title>${copy.subject}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Kridemy code is ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F4F6;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">
        <tr>
          <td style="height:6px;background:#F59E0B;font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 32px 8px;">
            <img src="cid:${LOGO_CID}" width="96" height="120" alt="Kridemy" style="display:block;border:0;outline:none;width:96px;height:120px;">
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 0;font-family:Arial,Helvetica,sans-serif;text-align:center;">
            <h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:#111827;font-weight:700;">${copy.heading}</h1>
            <p style="margin:0 0 6px;font-size:15px;line-height:24px;color:#374151;">Hi ${safeName},</p>
            <p style="margin:0;font-size:15px;line-height:24px;color:#4B5563;">${copy.intro}</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 32px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>${digitCells}</tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 24px;font-family:Arial,Helvetica,sans-serif;text-align:center;">
            <p style="margin:0;font-size:13px;line-height:20px;color:#6B7280;">This code expires in <strong style="color:#111827;">${OTP_EXPIRY_MINUTES} minutes</strong>.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F9FAFB;border-radius:10px;">
              <tr>
                <td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#4B5563;">
                  &#128274; <strong style="color:#111827;">Never share this code.</strong> Kridemy will never ask for it by phone, chat or email. If you didn't request this, you can safely ignore this email.
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #E5E7EB;font-family:Arial,Helvetica,sans-serif;text-align:center;">
            <p style="margin:0 0 4px;font-size:12px;line-height:18px;color:#6B7280;">Need help? Write to us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#B45309;text-decoration:none;">${SUPPORT_EMAIL}</a></p>
            <p style="margin:0;font-size:12px;line-height:18px;color:#9CA3AF;">&copy; ${new Date().getFullYear()} Kridemy &middot; Smarter Every Scroll</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

    const text = [
        `Hi ${(name || "").trim() || "there"},`,
        "",
        copy.intro,
        "",
        `Your code: ${otp}`,
        `This code expires in ${OTP_EXPIRY_MINUTES} minutes.`,
        "",
        "Never share this code with anyone. If you didn't request this, you can ignore this email.",
        "",
        `Need help? ${SUPPORT_EMAIL}`,
        "Team Kridemy"
    ].join("\n");

    return {
        subject: copy.subject,
        text,
        html,
        attachments: [{ filename: "kridemy-logo.png", path: LOGO_PATH, cid: LOGO_CID }]
    };
};

module.exports = {
    OTP_EXPIRY_MINUTES,
    MAX_OTP_ATTEMPTS,
    generateOtp,
    isOtpExpired,
    issueOtp,
    consumeOtpAttempt,
    buildOtpEmail
};
