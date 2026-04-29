id = "refactored_buildValidationSuccess";
/**
 * @file buildValidationSuccess.js
 * @module shared/validation
 *
 * Factory that produces the TAM Platform's canonical ValidationSuccessResult.
 *
 * Extracted into a dedicated module so success and failure envelopes
 * can evolve independently while preserving a stable validation contract
 * across the platform.
 *
 * Envelope contract (success)
 * ───────────────────────────
 * {
 *   valid : true
 *   data  : Readonly<T>
 *   error : null
 * }
 *
 * Immutability guarantee
 * ──────────────────────
 * The validated DTO is deeply cloned before freezing so the caller's
 * original reference is never mutated. Nested arrays and objects are
 * recursively frozen to guarantee runtime immutability throughout the
 * service layer.
 *
 * DTO scope
 * ─────────
 * This utility is intended for plain JSON-compatible DTO structures
 * produced by:
 * - HTTP request payloads
 * - queue messages
 * - cron payloads
 * - Zod-validated transport objects
 *
 * Non-JSON runtime constructs such as:
 * - class instances
 * - Maps/Sets
 * - Dates with custom prototypes
 * - circular references
 *
 * are intentionally outside the supported contract.
 *
 * Usage
 * ─────
 * import { buildValidationSuccess } from "./buildValidationSuccess.js";
 *
 * const parsed = schema.safeParse(req.body);
 *
 * if (parsed.success) {
 *   return buildValidationSuccess(parsed.data);
 * }
 */

/* ─────────────────────────────────────────────
   INTERNAL UTILITIES
───────────────────────────────────────────── */

/**
 * Deeply clones and freezes DTO structures safely.
 *
 * Guarantees:
 * - caller-owned references are never mutated
 * - nested arrays/objects become immutable
 * - output is deterministic
 *
 * Circular references are intentionally rejected because DTOs
 * originating from JSON payloads should never contain cycles.
 * Failing loudly here surfaces programmer/runtime misuse early.
 *
 * @template T
 * @param {T} value
 * @param {WeakSet<object>} [seen]
 * @returns {Readonly<T>}
 *
 * @throws {TypeError}
 * If a circular reference is detected.
 */
function deepCloneAndFreeze(value, seen = new WeakSet()) {
  // Primitive values are already immutable
  if (value === null || typeof value !== "object") {
    return value;
  }

  // DTOs should never contain circular references
  if (seen.has(value)) {
    throw new TypeError(
      "deepCloneAndFreeze: circular references are not supported in DTO structures.",
    );
  }

  seen.add(value);

  // Array handling
  if (Array.isArray(value)) {
    const clonedArray = value.map((item) => deepCloneAndFreeze(item, seen));

    return Object.freeze(clonedArray);
  }

  // Plain object handling
  const clonedObject = {};

  for (const key of Object.keys(value)) {
    clonedObject[key] = deepCloneAndFreeze(value[key], seen);
  }

  return Object.freeze(clonedObject);
}

/* ─────────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────────── */

/**
 * Builds canonical ValidationSuccessResult.
 *
 * PURE FUNCTION
 * ─────────────
 * - no side effects
 * - deterministic output
 * - immutable result envelope
 * - immutable DTO payload
 *
 * @template T
 * @param {T} data
 *
 * @returns {{
 *   valid: true,
 *   data: Readonly<T>,
 *   error: null
 * }}
 *
 * @throws {TypeError}
 * If `data` is null or undefined.
 */
export function buildValidationSuccess(data) {
  // Intentionally catches both null + undefined
  if (data == null) {
    throw new TypeError(
      "buildValidationSuccess: data must not be null or undefined.",
    );
  }

  const frozenData = deepCloneAndFreeze(data);

  return Object.freeze({
    valid: true,
    data: frozenData,
    error: null,
  });
}
