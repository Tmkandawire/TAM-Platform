/**
 * @file apiResponse.js
 * @module utils/apiResponse
 * @description Canonical success response factory for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Produce a consistent, well-typed response envelope for every
 *    successful HTTP response across all controllers
 *  • Enforce the canonical response shape at construction time so no
 *    controller can accidentally produce a malformed payload
 *  • Provide semantic static factories so controller code reads as
 *    intent, not implementation
 *
 * This module intentionally does NOT:
 *  • Handle errors — error responses are produced by ApiError and
 *    formatted by errorMiddleware
 *  • Send the response — controllers call res.status(response.statusCode).json(response)
 *  • Know about HTTP frameworks or request context
 *
 * Canonical response envelopes
 * ─────────────────────────────
 *
 *  Success (single resource or action result):
 *  {
 *    success:    true,
 *    statusCode: number,
 *    data:       object | null,
 *    message:    string,
 *    timestamp:  string          // ISO 8601
 *  }
 *
 *  Paginated list:
 *  {
 *    success:    true,
 *    statusCode: number,
 *    data:       array,
 *    meta: {
 *      total:        number,
 *      page:         number,
 *      limit:        number,
 *      totalPages:   number,
 *      hasNextPage:  boolean,
 *      hasPrevPage:  boolean
 *    },
 *    message:    string,
 *    timestamp:  string
 *  }
 *
 *  Empty list (no results):
 *  {
 *    success:    true,
 *    statusCode: 200,
 *    data:       [],
 *    meta: {
 *      total:        0,
 *      page:         number,
 *      limit:        number,
 *      totalPages:   0,
 *      hasNextPage:  false,
 *      hasPrevPage:  false
 *    },
 *    message:    string,
 *    timestamp:  string
 *  }
 *
 *  Partial success (bulk operations with mixed outcomes):
 *  {
 *    success:    true,
 *    statusCode: 207,
 *    data: {
 *      results: array,   // successfully processed items
 *      errors:  array    // items that failed with reasons
 *    },
 *    meta: {
 *      total:     number,
 *      succeeded: number,
 *      failed:    number
 *    },
 *    message:    string,
 *    timestamp:  string
 *  }
 *
 *  No content (HTTP 204 — delete operations):
 *    No body. res.status(204).end() — see ApiResponse.noContent() usage note.
 *
 * statusCode on the instance
 * ───────────────────────────
 *  statusCode is stored on the instance so:
 *  • Controllers can call res.status(response.statusCode).json(response)
 *    without hardcoding the code twice (once in the factory call, once in res.status())
 *  • Middleware and logging pipelines can inspect the intended status
 *    code from the response object without reading res.statusCode
 *  • Debugging is easier — the full response shape is self-describing
 *
 * meta validation
 * ────────────────
 *  meta must be a plain object (not an array, string, or other type) when
 *  provided. This prevents silently malformed responses where meta arrives
 *  as the wrong type and breaks client-side pagination logic. Pagination
 *  meta shape is additionally validated via buildPaginationMeta().
 *
 * Usage
 * ─────
 *  const response = ApiResponse.ok(user);
 *  res.status(response.statusCode).json(response);
 *
 *  const response = ApiResponse.paginated(documents, { total, page, limit });
 *  res.status(response.statusCode).json(response);
 *
 *  ApiResponse.noContent(res);
 *  return;
 *
 *  const response = ApiResponse.partial({ results, errors, total, succeeded, failed });
 *  res.status(response.statusCode).json(response);
 */

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

/**
 * Valid HTTP success status codes this class accepts.
 * Enforced at construction time — prevents silently producing a 500
 * wrapped in success: true.
 *
 * 207 Multi-Status is included for bulk partial success responses
 * where some items succeeded and some failed within the same request.
 *
 * @type {Set<number>}
 */
const VALID_SUCCESS_CODES = new Set([200, 201, 202, 203, 204, 206, 207]);

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

/**
 * Returns true if value is a plain object (not null, not array, not
 * a class instance other than Object).
 *
 * Used to validate the meta parameter before accepting it.
 *
 * @param   {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Builds a validated, computed pagination meta object.
 *
 * Validates all required fields and guards against division by zero
 * when limit is 0 or missing — which would otherwise produce
 * totalPages: Infinity and hasNextPage: true indefinitely.
 *
 * @param   {object} pagination
 * @param   {number} pagination.total
 * @param   {number} pagination.page
 * @param   {number} pagination.limit
 * @returns {{ total, page, limit, totalPages, hasNextPage, hasPrevPage }}
 * @throws  {TypeError}
 */
function buildPaginationMeta({ total, page, limit }) {
  if (!Number.isInteger(total) || total < 0) {
    throw new TypeError(
      `ApiResponse: "total" must be a non-negative integer, received ${JSON.stringify(total)}.`,
    );
  }
  if (!Number.isInteger(page) || page < 1) {
    throw new TypeError(
      `ApiResponse: "page" must be a positive integer, received ${JSON.stringify(page)}.`,
    );
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError(
      `ApiResponse: "limit" must be a positive integer (≥ 1), received ${JSON.stringify(limit)}.`,
    );
  }

  const totalPages = Math.ceil(total / limit);

  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Validates and builds the meta object for a partial success response.
 *
 * All three counts are required and must be non-negative integers.
 * succeeded + failed must equal total — enforced here so callers
 * cannot accidentally produce an inconsistent summary.
 *
 * @param   {{ total: number, succeeded: number, failed: number }} counts
 * @returns {{ total: number, succeeded: number, failed: number }}
 * @throws  {TypeError}
 */
function buildPartialMeta({ total, succeeded, failed }) {
  for (const [name, value] of [
    ["total", total],
    ["succeeded", succeeded],
    ["failed", failed],
  ]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new TypeError(
        `ApiResponse.partial: "${name}" must be a non-negative integer, received ${JSON.stringify(value)}.`,
      );
    }
  }

  if (succeeded + failed !== total) {
    throw new TypeError(
      `ApiResponse.partial: "succeeded" (${succeeded}) + "failed" (${failed}) must equal "total" (${total}).`,
    );
  }

  return { total, succeeded, failed };
}

/* ─────────────────────────────────────────────
   CLASS
───────────────────────────────────────────── */

class ApiResponse {
  /**
   * @param {Object}        params
   * @param {number}        params.statusCode - Must be a recognised 2xx code.
   * @param {unknown}       [params.data]     - Response payload. null is the
   *   correct explicit empty value — undefined is normalized to null.
   * @param {string}        [params.message]  - Human-readable description.
   * @param {object|null}   [params.meta]     - Must be a plain object when
   *   provided — arrays, strings, and class instances throw at construction time.
   */
  constructor({ statusCode, data = null, message = "Success", meta = null }) {
    // ── Contract enforcement ──────────────────────────────────────────────

    if (!VALID_SUCCESS_CODES.has(statusCode)) {
      throw new TypeError(
        `ApiResponse: "${statusCode}" is not a recognised success status code. ` +
          `Valid codes: ${[...VALID_SUCCESS_CODES].join(", ")}.`,
      );
    }

    if (typeof message !== "string" || message.trim().length === 0) {
      throw new TypeError(
        `ApiResponse: "message" must be a non-empty string, received ${JSON.stringify(message)}.`,
      );
    }

    if (meta !== null && !isPlainObject(meta)) {
      throw new TypeError(
        `ApiResponse: "meta" must be a plain object or null, received ${
          Array.isArray(meta) ? "array" : typeof meta
        }.`,
      );
    }

    // ── Construction ─────────────────────────────────────────────────────

    this.success = true;

    // Stored on the instance so controllers can use res.status(response.statusCode)
    // without hardcoding the status code twice, and so middleware / logging
    // pipelines can inspect the intended status from the object itself.
    this.statusCode = statusCode;

    // undefined normalized to null — ensures data key is always present
    // and consistently typed in JSON output.
    this.data = data !== undefined ? data : null;

    this.message = message;

    if (meta !== null) {
      this.meta = meta;
    }

    this.timestamp = new Date().toISOString();
  }

  /* ─────────────────────────────────────────
     STATIC FACTORIES
  ───────────────────────────────────────── */

  /**
   * HTTP 200 — resource or action result returned successfully.
   *
   * @param   {unknown} data
   * @param   {string}  [message]
   * @returns {ApiResponse}
   *
   * @example
   *   const response = ApiResponse.ok(user);
   *   res.status(response.statusCode).json(response);
   */
  static ok(data, message = "Success") {
    return new ApiResponse({ statusCode: 200, data, message });
  }

  /**
   * HTTP 201 — resource created successfully.
   *
   * @param   {unknown} data
   * @param   {string}  [message]
   * @returns {ApiResponse}
   *
   * @example
   *   const response = ApiResponse.created(document);
   *   res.status(response.statusCode).json(response);
   */
  static created(data, message = "Created successfully.") {
    return new ApiResponse({ statusCode: 201, data, message });
  }

  /**
   * HTTP 204 — action completed with no content to return.
   *
   * HTTP 204 responses MUST NOT include a body. This factory therefore
   * does not return an ApiResponse instance — it writes the response
   * directly via res.status(204).end() so call sites cannot accidentally
   * serialize a body.
   *
   * @param   {import("express").Response} res - Express response object.
   * @returns {void}
   *
   * @example
   *   ApiResponse.noContent(res);
   *   return;   // ← always return immediately after — response is already sent
   */
  static noContent(res) {
    return res.status(204).end();
  }

  /**
   * HTTP 200 — paginated list of results.
   *
   * Validates pagination inputs and guards against division by zero.
   *
   * @param   {Array}   data
   * @param   {{ total: number, page: number, limit: number }} pagination
   * @param   {string}  [message]
   * @returns {ApiResponse}
   *
   * @example
   *   const response = ApiResponse.paginated(documents, { total, page, limit });
   *   res.status(response.statusCode).json(response);
   */
  static paginated(data, pagination, message = "Success") {
    if (!Array.isArray(data)) {
      throw new TypeError(
        `ApiResponse.paginated: "data" must be an array, received ${typeof data}.`,
      );
    }

    const meta = buildPaginationMeta(pagination);
    return new ApiResponse({ statusCode: 200, data, message, meta });
  }

  /**
   * HTTP 200 — empty list response (zero results).
   *
   * Returns data: [] with zeroed meta rather than omitting the data key
   * or returning null. Clients never need to guard against a missing key
   * or handle null as "no results".
   *
   * Use instead of paginated() when the result set is known to be empty —
   * avoids unnecessary pagination computation and makes intent explicit.
   *
   * @param   {{ page: number, limit: number }} pagination
   * @param   {string} [message]
   * @returns {ApiResponse}
   *
   * @example
   *   if (documents.length === 0) {
   *     const response = ApiResponse.empty({ page, limit });
   *     return res.status(response.statusCode).json(response);
   *   }
   */
  static empty({ page, limit } = {}, message = "No results found.") {
    if (!Number.isInteger(page) || page < 1) {
      throw new TypeError(
        `ApiResponse.empty: "page" must be a positive integer, received ${JSON.stringify(page)}.`,
      );
    }
    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError(
        `ApiResponse.empty: "limit" must be a positive integer (≥ 1), received ${JSON.stringify(limit)}.`,
      );
    }

    const meta = {
      total: 0,
      page,
      limit,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    };

    return new ApiResponse({ statusCode: 200, data: [], message, meta });
  }

  /**
   * HTTP 207 Multi-Status — bulk operation with mixed outcomes.
   *
   * Used when a batch request partially succeeded — some items were
   * processed successfully and some failed. The 207 status signals to
   * clients that the request was accepted and processed, but they must
   * inspect the response body to determine per-item outcomes.
   *
   * data.results contains successfully processed items.
   * data.errors  contains failed items with codes and messages.
   * meta carries the summary counts for quick client-side checks.
   *
   * succeeded + failed must equal total — enforced at construction time
   * to prevent inconsistent summaries reaching the client.
   *
   * @param   {Object}   params
   * @param   {Array}    params.results    - Successfully processed items.
   * @param   {Array}    params.errors     - Failed items with error detail.
   * @param   {number}   params.total      - Total items submitted.
   * @param   {number}   params.succeeded  - Count of succeeded items.
   * @param   {number}   params.failed     - Count of failed items.
   * @param   {string}   [message]
   * @returns {ApiResponse}
   *
   * @example
   *   const response = ApiResponse.partial({
   *     results,
   *     errors,
   *     total: documents.length,
   *     succeeded: results.length,
   *     failed: errors.length,
   *   });
   *   res.status(response.statusCode).json(response);
   */
  static partial(
    { results, errors, total, succeeded, failed },
    message = "Bulk operation completed with partial success.",
  ) {
    if (!Array.isArray(results)) {
      throw new TypeError(
        `ApiResponse.partial: "results" must be an array, received ${typeof results}.`,
      );
    }

    if (!Array.isArray(errors)) {
      throw new TypeError(
        `ApiResponse.partial: "errors" must be an array, received ${typeof errors}.`,
      );
    }

    const meta = buildPartialMeta({ total, succeeded, failed });

    return new ApiResponse({
      statusCode: 207,
      data: { results, errors },
      message,
      meta,
    });
  }
}

export default ApiResponse;
