export default function accountApprovedTemplate({
  dashboardUrl,
  brandName = "TAM",
}) {
  const subject = `Welcome to ${brandName} — Your Membership is Approved`;
  const text = `Congratulations! Your ${brandName} membership application has been approved. Your account is now active. ${dashboardUrl ? `Visit your dashboard: ${dashboardUrl}` : ""}`;
  const html = `
    <h1>Membership Approved</h1>
    <p>Congratulations! Your ${brandName} membership application has been approved and your account is now active.</p>
    ${dashboardUrl ? `<p><a href="${dashboardUrl}">Go to your dashboard</a></p>` : ""}
  `;
  return { subject, html, text };
}
