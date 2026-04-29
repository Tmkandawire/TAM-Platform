/**
 * @file normalizeZodErrors.js
 * @module shared/validation
 */

const ROOT_FIELD = "root";

/**
 * Prevent runaway validation payloads.
 * Protects APIs/logging systems from massive error amplification.
 */
const MAX_ERRORS = 100;

/**
 * Converts a Zod path array into bracket-aware notation.
 *
 * @param   {unknown[]} path
 * @returns {string}
 */
function renderPath(path) {
  if (!Array.isArray(path) || path.length === 0) {
    return ROOT_FIELD;
  }

  return path.reduce((acc, segment, index) => {
    const value = String(segment);

    if (typeof segment === "number") {
      return `${acc}[${value}]`;
    }

    return index === 0 ? value : `${acc}.${value}`;
  }, "");
}

/**
 * Normalizes a single Zod issue into FieldError(s).
 *
 * @param   {import("zod").ZodIssue} issue
 * @returns {Array<{
 *   field: string,
 *   message: string,
 *   code: string
 * }>}
 */
function normalizeIssue(issue) {
  const field = renderPath(issue.path);

  // Strict object violations
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => ({
      field: field === ROOT_FIELD ? String(key) : `${field}.${String(key)}`,
      message: `Unrecognized field "${String(key)}".`,
      code: issue.code,
    }));
  }

  /**
   * Union failures can explode recursively.
   * We intentionally emit ONLY the first branch's issues.
   */
  if (
    issue.code === "invalid_union" &&
    Array.isArray(issue.unionErrors) &&
    issue.unionErrors.length > 0
  ) {
    return issue.unionErrors[0].issues.flatMap(normalizeIssue);
  }

  return [
    {
      field,
      message: issue.message || "Invalid value.",
      code: issue.code || "validation_error",
    },
  ];
}

/**
 * Converts a ZodError-like object into FieldError[].
 *
 * @param   {unknown} zodError
 * @returns {Array<{
 *   field: string,
 *   message: string,
 *   code: string
 * }>}
 * @throws  {TypeError} If the argument is not a ZodError-like object.
 */
export function normalizeZodErrors(zodError) {
  // Defensive validation without relying on instanceof
  if (
    !zodError ||
    typeof zodError !== "object" ||
    !Array.isArray(zodError.issues)
  ) {
    throw new TypeError("normalizeZodErrors expected a ZodError-like object.");
  }

  const normalized = [];
  const seen = new Set();

  for (const issue of zodError.issues) {
    const entries = normalizeIssue(issue);

    for (const entry of entries) {
      const key = `${entry.field}::${entry.code}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      normalized.push(entry);

      // Hard safety cap
      if (normalized.length >= MAX_ERRORS) {
        return normalized;
      }
    }
  }

  return normalized;
}
