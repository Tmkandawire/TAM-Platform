export default function accountSuspendedTemplate({ brandName = "TAM" }) {
  const subject = `Your ${brandName} Account Has Been Suspended`;
  const text = `Your ${brandName} account has been suspended. Please contact support for further information.`;
  const html = `
    <h1>Account Suspended</h1>
    <p>Your ${brandName} account has been suspended. Please contact the secretariat for further information.</p>
  `;
  return { subject, html, text };
}
