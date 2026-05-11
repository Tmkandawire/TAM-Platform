/**
 * @file buildValidation.js
 * @module shared/buildValidation
 * @description Canonical validation result factories for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Produce immutable, consistently shaped validation result objects
 *    consumed by DTOs, validators, and service-layer callers
 *  • Enforce field-level error shape integrity before producing a failure
 *    result so downstream handlers always receive a well-typed payload
 *  • Cap field-level error arrays to prevent runaway validation payloads
 *    from amplifying into log storage or API response bloat
 *
 * This module intentionally does NOT:
 *  • Run validation — that is Zod's or the DTO's responsibility
 *  • Know about HTTP frameworks, middleware, or response formatting
 *  • Throw typed ApiError subclasses — it returns result objects;
 *    callers decide whether to throw based on the `valid` flag
 *
 * Validation result contract
 * ───────────────────────────
 *
 *  Success:
 *  {
 *    valid: true,
 *    data:  Readonly<T>,   // deeply cloned and frozen DTO
 *    error: null
 *  }
 *
 *  Failure:
 *  {
 *    valid: false,
 *    data:  null,
 *    error: {
 *      code:    "VALIDATION_ERROR",
 *      details: ReadonlyArray<{ field: string, message: string, code: string }>
 *    }
 *  }
 *
 * Immutability strategy
 * ──────────────────────
 *  Both results and their payloads are deeply frozen. This guarantees
 *  the service layer cannot accidentally mutate a validated DTO after
 *  it passes the validation boundary.
 *
 *  Clone strategy (in priority order):
 *  1. structuredClone — available Node 17+. Handles most types correctly,
 *     throws on uncloneable values (functions, class instances with methods).
 *  2. JSON round-trip — fallback for older runtimes. Fast-fails on
 *     unsupported types (Date → throws, undefined → throws) rather than
 *     silently dropping or coercing values. See safeJsonClone() below.
 *
 *  Performance note (Gap 1):
 *  clone() + deepFreeze() is O(n) + O(n) = O(n) over the payload size.
 *  For this platform's DTO sizes this is negligible. If validation becomes
 *  a measured bottleneck at scale, consider skipping clone for read-only
 *  paths or using a structural sharing approach. Do not optimize prematurely.
 *
 * DTO scope
 * ─────────
 *  Plain JSON-compatible structures only:
 *    ✔ HTTP request payloads, queue messages, cron payloads, Zod output
 *    ✗ Class instances, Maps/Sets, Dates with custom prototypes,
 *      circular references, Symbol-keyed properties
 *
 * Usage
 * ─────
 *  import { buildValidationSuccess, buildValidationFailure } from "./buildValidation.js";
 *
 *  // Success
 *  const parsed = schema.safeParse(req.body);
 *  if (parsed.success) return buildValidationSuccess(parsed.data);
 *
 *  // Failure
 *  const errors = normalizeZodErrors(parsed.error);
 *  return buildValidationFailure(errors);
 *
 *  // Caller decides whether to throw
 *  const result = validate(req.body);
 *  if (!result.valid) throw ValidationError.zod(parsed.error);
 */

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Top-level machine-readable code for all validation failure results.
 * Matches the code established in ValidationError.js.
 *
 * @type {string}
 */
export const VALIDATION_ERROR_CODE = "VALIDATION_ERROR";

/**
 * Maximum number of field-level errors included in a failure result.
 * Entries beyond this cap are replaced with a single truncation notice.
 *
 * @type {number}
 */
const MAX_ERROR_DETAILS = 100;

/* ─────────────────────────────────────────────
   INTERNAL UTILITIES
───────────────────────────────────────────── */

/**
 * JSON round-trip clone with fast-fail on unsupported types.
 *
 * Unlike a naive JSON.parse(JSON.stringify(value)) call, this wrapper
 * uses a replacer function to detect and reject values that JSON would
 * silently coerce or drop — Dates become strings, undefined disappears,
 * functions are silently omitted. Any of these in a DTO is a programmer
 * error that should surface immediately rather than produce subtly wrong data.
 *
 * @param   {unknown} value
 * @returns {unknown}
 * @throws  {TypeError} If the value contains a Date, undefined, function,
 *   or other JSON-unsupported type.
 */
function safeJsonClone(value) {
  const replacer = (key, val) => {
    if (val instanceof Date) {
      throw new TypeError(
        `buildValidation (JSON fallback): Date values are not supported in DTOs. ` +
          `Found at key "${key}". Use an ISO 8601 string instead.`,
      );
    }
    if (typeof val === "undefined") {
      throw new TypeError(
        `buildValidation (JSON fallback): undefined values are not supported in DTOs. ` +
          `Found at key "${key}". Use null for intentional absence.`,
      );
    }
    if (typeof val === "function") {
      throw new TypeError(
        `buildValidation (JSON fallback): function values are not supported in DTOs. ` +
          `Found at key "${key}".`,
      );
    }
    return val;
  };

  return JSON.parse(JSON.stringify(value, replacer));
}

/**
 * Deeply clones plain DTO structures safely.
 *
 * Uses native structuredClone when available (Node 17+).
 * Falls back to safeJsonClone for older runtimes — fails fast on
 * unsupported types rather than silently coercing or dropping values.
 *
 * @param   {unknown} value
 * @returns {unknown}
 */
function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return safeJsonClone(value);
}

/**
 * Recursively freezes plain objects and arrays in-place.
 *
 * Only enumerable own-properties are traversed.
 * Symbol-keyed properties are intentionally ignored.
 * Already-frozen values are skipped.
 *
 * @param   {unknown} value
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
 * Returns true if `error` conforms to the FieldError shape:
 * `{ field: string, message: string, code: string }`.
 *
 * @param   {unknown} error
 * @returns {boolean}
 */
function isValidFieldError(error) {
  return (
    error !== null &&
    typeof error === "object" &&
    typeof error.field === "string" &&
    typeof error.message === "string" &&
    typeof error.code === "string"
  );
}

/**
 * Clones a single FieldError into a new plain object.
 *
 * Ensures each FieldError entry in the details array is independently
 * cloned before freezing — preventing upstream mutations to the original
 * objects from bypassing the immutability guarantee on the frozen array.
 *
 * Only copies the three required fields (field, message, code) — any
 * extra properties on the original are intentionally excluded to keep
 * the failure result shape strictly typed.
 *
 * @param   {{ field: string, message: string, code: string }} fieldError
 * @returns {{ field: string, message: string, code: string }}
 */
function cloneFieldError(fieldError) {
  return {
    field: fieldError.field,
    message: fieldError.message,
    code: fieldError.code,
  };
}

/**
 * Validates, filters, clones, and caps the details array before it is
 * embedded in a ValidationFailureResult.
 *
 * Invalid FieldError entries (wrong shape) are silently filtered out —
 * partial validation errors are better than no error information at all.
 * Zero valid entries throws — that is a programmer error.
 *
 * Each valid entry is cloned via cloneFieldError() before the array is
 * frozen — ensuring upstream mutations to original error objects cannot
 * bypass the immutability guarantee on the frozen details array.
 *
 * @param   {unknown} details
 * @returns {Array<{ field: string, message: string, code: string }>}
 * @throws  {TypeError}
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
      "buildValidationFailure: no valid FieldError entries detected. " +
        "Each entry must have { field: string, message: string, code: string }.",
    );
  }

  // Clone each entry independently before capping — upstream references
  // to the original objects are severed here, not at the freeze step.
  const cloned = valid.map(cloneFieldError);

  if (cloned.length <= MAX_ERROR_DETAILS) {
    return cloned;
  }

  // Cap and append truncation notice.
  const capped = cloned.slice(0, MAX_ERROR_DETAILS);
  capped.push({
    field: "root",
    message: `Validation errors truncated at ${MAX_ERROR_DETAILS} entries.`,
    code: "VALIDATION_TRUNCATED",
  });

  return capped;
}

/* ─────────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────────── */

/**
 * Builds a canonical ValidationSuccessResult.
 *
 * The validated DTO is cloned before freezing so the caller's original
 * reference is never mutated. The result envelope is also frozen.
 *
 * PURE FUNCTION — no side effects, deterministic output.
 *
 * @template T
 * @param   {T} data - Must not be null or undefined.
 * @returns {{ valid: true, data: Readonly<T>, error: null }}
 * @throws  {TypeError} If data is null or undefined.
 *
 * @example
 *   const parsed = schema.safeParse(req.body);
 *   if (parsed.success) return buildValidationSuccess(parsed.data);
 */
export function buildValidationSuccess(data) {
  if (data == null) {
    throw new TypeError(
      "buildValidationSuccess: data must not be null or undefined.",
    );
  }

  return Object.freeze({
    valid: true,
    data: deepFreeze(clone(data)),
    error: null,
  });
}

/**
 * Builds a canonical ValidationFailureResult.
 *
 * Each FieldError entry is cloned independently before the array is
 * frozen — severing all references to upstream objects and guaranteeing
 * full immutability of the failure result.
 *
 * PURE FUNCTION — no side effects, deterministic output.
 *
 * @param {Array<{ field: string, message: string, code: string }>} details
 * @returns {{
 *   valid:  false,
 *   data:   null,
 *   error: {
 *     code:    string,
 *     details: ReadonlyArray<{ field: string, message: string, code: string }>
 *   }
 * }}
 * @throws {TypeError} If details is not a non-empty array or contains
 *   zero valid FieldError entries.
 *
 * @example
 *   const errors = normalizeZodErrors(parsed.error);
 *   return buildValidationFailure(errors);
 */
export function buildValidationFailure(details) {
  const normalized = normalizeDetails(details);

  return Object.freeze({
    valid: false,
    data: null,
    error: Object.freeze({
      code: VALIDATION_ERROR_CODE,
      details: deepFreeze(normalized),
    }),
  });
}
