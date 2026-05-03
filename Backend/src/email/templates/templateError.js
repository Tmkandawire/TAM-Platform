/**
 * @file templateError.js
 * @module email/templates
 *
 * Shared error class for the template layer.
 * Carries a machine-readable `code` and optional `field` so callers
 * can branch on error type without brittle message-string matching.
 */

export class TemplateError extends TypeError {
  /**
   * @param {string} message  - Human-readable description.
   * @param {string} code     - Machine-readable error code.
   * @param {string} [field]  - The offending input field name.
   */
  constructor(message, code, field = null) {
    super(message);

    // Ensure correct prototype chain (important for instanceof checks)
    Object.setPrototypeOf(this, new.target.prototype);

    // Improve stack trace readability (Node.js environments)
    Error.captureStackTrace?.(this, TemplateError);

    this.name = "TemplateError";
    this.code = code;
    this.field = field;
  }
}
