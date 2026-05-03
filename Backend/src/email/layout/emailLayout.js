/**
 * @file emailLayout.js
 * @module email/layout
 *
 * Base HTML layout for all transactional emails on the TAM Platform.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Provide a table-based layout shell for email client compatibility
 *  • Centralise all theme tokens (colors, spacing, typography)
 *  • Escape interpolated text values to prevent injection
 *  • Validate inputs at the boundary before rendering
 */

const BRAND_NAME = process.env.BRAND_NAME?.trim() || "TAM Platform";

const THEME = Object.freeze({
  maxWidth: 600,
  fontFamily: "Arial, sans-serif",
  textColor: "#111111",
  secondaryText: "#888888",
  background: "#f4f4f4",
  containerBg: "#ffffff",
  padding: "16px",
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function assertParams(params) {
  if (params === null || typeof params !== "object" || Array.isArray(params)) {
    throw new TypeError("emailLayout: params must be a plain object.");
  }

  if (typeof params.title !== "string" || params.title.trim().length === 0) {
    throw new TypeError('emailLayout: "title" must be a non-empty string.');
  }

  if (typeof params.bodyHtml !== "string") {
    throw new TypeError('emailLayout: "bodyHtml" must be a string.');
  }

  if (params.preheader !== undefined && typeof params.preheader !== "string") {
    throw new TypeError(
      'emailLayout: "preheader", when provided, must be a string.',
    );
  }
}

export function renderBaseLayout({ title, bodyHtml, preheader = "" } = {}) {
  assertParams({ title, bodyHtml, preheader });

  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>

  <body style="margin:0; padding:0; background:${THEME.background}; font-family:${THEME.fontFamily};">

    <span style="display:none; font-size:0; color:transparent; max-height:0; max-width:0; opacity:0; overflow:hidden;">
      ${safePreheader}
    </span>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${THEME.background}; border-collapse: collapse;">
      <tr>
        <td align="center">

          <table role="presentation" width="${THEME.maxWidth}" cellpadding="0" cellspacing="0" style="background:${THEME.containerBg}; width:100%; max-width:${THEME.maxWidth}px; border-collapse: collapse;">

            <tr>
              <td style="padding:${THEME.padding};">
                <h2 style="margin:0; color:${THEME.textColor};">
                  ${safeTitle}
                </h2>
              </td>
            </tr>

            <tr>
              <td style="padding:${THEME.padding}; color:${THEME.textColor}; line-height:1.5;">
                ${bodyHtml}
              </td>
            </tr>

            <tr>
              <td style="padding:${THEME.padding}; font-size:12px; color:${THEME.secondaryText};">
                <p style="margin:0;">${BRAND_NAME}</p>
                <p style="margin:4px 0 0;">This is a transactional email from ${BRAND_NAME}.</p>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>

  </body>
</html>`;
}
