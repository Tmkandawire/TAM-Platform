export default function passwordResetTemplate({ resetUrl, brandName = "TAM" }) {
  const subject = `${brandName} — Password Reset Request`;
  const text = `You requested a password reset. Click the link below to reset your password. This link expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;
  const html = `
    <h1>Password Reset Request</h1>
    <p>You requested a password reset for your ${brandName} account.</p>
    <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
    <p><a href="${resetUrl}" style="background:#ea4335;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Reset Password</a></p>
    <p>If the button doesn't work, copy and paste this link into your browser:</p>
    <p>${resetUrl}</p>
    <p>If you did not request a password reset, you can safely ignore this email.</p>
  `;
  return { subject, html, text };
}
