/**
 * @file contactReplyTemplate.js
 * Email template for admin replies to contact form submissions.
 */

export default function contactReplyTemplate({
  name,
  replyMessage,
  brandName = "TAM",
}) {
  const subject = `Re: Your Enquiry to ${brandName}`;

  const html = `
    <h2 style="color:#1a1a1a;font-size:20px;margin-bottom:16px;">
      Hello ${name},
    </h2>
    <p style="color:#4a4a4a;font-size:15px;line-height:1.6;margin-bottom:16px;">
      Thank you for reaching out to the TAM Secretariat. Please see our response below.
    </p>
    <div style="background:#f5f5f5;border-left:4px solid #e53e3e;padding:16px 20px;border-radius:4px;margin-bottom:24px;">
      <p style="color:#1a1a1a;font-size:15px;line-height:1.7;margin:0;white-space:pre-line;">${replyMessage}</p>
    </div>
    <p style="color:#4a4a4a;font-size:14px;line-height:1.6;margin-bottom:8px;">
      If you have any further questions, please don't hesitate to contact us again at
      <a href="mailto:info@transportersmw.com" style="color:#e53e3e;">info@transportersmw.com</a>
      or call us on +265 891 003 936.
    </p>
    <p style="color:#4a4a4a;font-size:14px;margin-top:24px;">
      Warm regards,<br/>
      <strong>The TAM Secretariat</strong>
    </p>
  `;

  const text = `Hello ${name},\n\nThank you for reaching out to the TAM Secretariat. Please see our response below.\n\n${replyMessage}\n\nIf you have further questions, contact us at info@transportersmw.com or +265 891 003 936.\n\nWarm regards,\nThe TAM Secretariat`;

  return { subject, html, text };
}
