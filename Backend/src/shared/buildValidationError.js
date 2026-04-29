/**
 * @file buildValidationError.js
 * @module shared/validation
 */

export const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";

const MAX_ERROR_DETAILS = 100;

/**
 * Deeply clones plain DTO structures safely.
 *
 * Uses native structuredClone when available.
 * Falls back to JSON cloning for older runtimes.
 *
 * NOTE:
 * Intended ONLY for validation DTOs composed of
 * plain JSON-compatible values.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

/**
 * Recursively freezes arrays/objects.
 *
 * IMPORTANT:
 * - Only enumerable own-properties are traversed
 * - Symbol-keyed properties are ignored intentionally
 * - Intended for plain DTOs, not exotic runtime objects
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }

  return value;
}

/**
 * Validates FieldError shape integrity.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isValidFieldError(error) {
  if (error === null || typeof error !== "object") {
    return false;
  }

  return (
    typeof error.field === "string" &&
    typeof error.message === "string" &&
    typeof error.code === "string"
  );
}

/**
 * Normalizes and caps validation details safely.
 *
 * Never throws for excessive validation errors —
 * preserves deterministic ValidationFailureResult contract.
 *
 * @param {unknown} details
 * @returns {Array<{
 *   field: string,
 *   message: string,
 *   code: string
 * }>}
 */
function normalizeDetails(details) {
  if (!Array.isArray(details) || details.length === 0) {
    throw new TypeError(
      "buildValidationFailure: details must be a non-empty array.",
    );
  }

  const valid = details.filter(isValidFieldError);

  if (valid.length === 0) {
    throw new TypeError(
      "buildValidationFailure: no valid FieldError entries detected.",
    );
  }

  const capped = valid.slice(0, MAX_ERROR_DETAILS);

  if (valid.length > MAX_ERROR_DETAILS) {
    capped.push({
      field: "root",
      message:
        "Validation errors truncated at " + MAX_ERROR_DETAILS + " entries.",
      code: "validation_truncated",
    });
  }

  return capped;
}

/**
 * Builds successful validation result.
 *
 * @template T
 * @param {T} data
 * @returns {{
 *   valid: true,
 *   data: Readonly<T>,
 *   error: null
 * }}
 */
export function buildValidationSuccess(data) {
  if (data === null || data === undefined) {
    throw new TypeError(
      "buildValidationSuccess: data must not be null or undefined.",
    );
  }

  const frozen = deepFreeze(clone(data));

  return Object.freeze({
    valid: true,
    data: frozen,
    error: null,
  });
}

/**
 * Builds failed validation result.
 *
 * @param {Array<{
 *   field: string,
 *   message: string,
 *   code: string
 * }>} details
 *
 * @returns {{
 *   valid: false,
 *   data: null,
 *   error: {
 *     code: string,
 *     details: ReadonlyArray<{
 *       field: string,
 *       message: string,
 *       code: string
 *     }>
 *   }
 * }}
 */
export function buildValidationFailure(details) {
  const normalized = normalizeDetails(details);

  return Object.freeze({
    valid: false,
    data: null,
    error: Object.freeze({
      code: VALIDATION_ERROR_CODE,
      details: deepFreeze([...normalized]),
    }),
  });
}
