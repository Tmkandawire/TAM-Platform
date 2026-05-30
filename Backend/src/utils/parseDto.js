/**
 * @file parseDto.js
 * @module utils/parseDto
 *
 * Shared DTO parsing utilities for the HTTP boundary layer.
 *
 * Responsibilities
 * ─────────────────────────────────────────────────────────────
 *  • Map Zod SafeParseError results to the platform's typed ValidationError
 *  • Provide a single parse-and-throw entry point for controller use
 *
 * This module intentionally does NOT:
 *  • own Zod schemas (those live in /dto)
 *  • perform authorization
 *  • access the database
 *
 * Usage
 * ─────────────────────────────────────────────────────────────
 *  import { parseDto } from "../utils/parseDto.js";
 *
 *  // Throws ValidationError with field-level issues on failure.
 *  // Returns parsed.data on success — no conditional needed at call site.
 *  const data = parseDto(mySchema.safeParse(req.body));
 */

import { ValidationError } from "../errors/index.js";

/**
 * Maps a Zod SafeParseError to the platform's typed ValidationError and throws.
 * The first issue drives the primary message; all issues are forwarded in the
 * errors array so clients surface every problem in a single round trip.
 *
 * @param {import("zod").ZodError} zodError
 * @param {string} [source="input"] - The input source label used in the primary
 *   error field when the issue path is empty (e.g. "query", "body", "params").
 *   Defaults to "input" for generic call sites.
 * @throws {ValidationError}
 */
function throwFromZodError(zodError, source = "input") {
  throw ValidationError.zod(zodError, null);
}

/**
 * Parses a Zod SafeParseReturn result.
 *
 * On success: returns the parsed, coerced data directly — no conditional
 * needed at the call site.
 *
 * On failure: maps the ZodError to a platform ValidationError and throws —
 * asyncHandler forwards it to errorMiddleware for a consistent 400 response.
 *
 * @template T
 * @param {import("zod").SafeParseReturnType<unknown, T>} result
 *   The return value of schema.safeParse(input).
 * @param {string} [source="input"] - Forwarded to throwFromZodError as the
 *   fallback field label when a Zod issue has an empty path.
 * @returns {T} The successfully parsed and coerced data.
 * @throws {ValidationError}
 *
 * @example
 * // Before — two steps, conditional at call site:
 * const parsed = auditLogQuerySchema.safeParse(req.query);
 * if (!parsed.success) throwFromZodError(parsed.error);
 * const { page, limit } = parsed.data;
 *
 * // After — one line, data returned directly:
 * const { page, limit } = parseDto(auditLogQuerySchema.safeParse(req.query), "query");
 */
export function parseDto(result) {
  if (!result.success) {
    throwFromZodError(result.error);
  }
  return result.data;
}
