export default function accountReinstatedTemplate({
  dashboardUrl,
  brandName = "TAM",
}) {
  const subject = `Your ${brandName} Account Has Been Reinstated`;
  const text = `Your ${brandName} account has been reinstated. You now have full access to the member portal. ${dashboardUrl ? `Visit your dashboard: ${dashboardUrl}` : ""}`;
  const html = `
    <h1>Account Reinstated</h1>
    <p>Your ${brandName} account has been reinstated. You now have full access to the member portal.</p>
    ${dashboardUrl ? `<p><a href="${dashboardUrl}">Go to your dashboard</a></p>` : ""}
  `;
  return { subject, html, text };
}
