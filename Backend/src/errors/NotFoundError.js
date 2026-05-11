/**
 * @file NotFoundError.js
 * @module errors/NotFoundError
 * @description Typed 404 error for the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Extend ApiError with a hardcoded 404 status so call sites never
 *    repeat the status code or the empty errors array
 *  • Expose named static factories for domain-specific 404 variants
 *    (user, profile, document) so error construction is expressive and
 *    machine-readable codes are never typed by hand at call sites
 *
 * This module intentionally does NOT:
 *  • Handle or catch errors
 *  • Know about HTTP frameworks, middleware, or response formatting
 *  • Introduce new error codes beyond those established across the codebase
 *
 * Inheritance chain
 * ─────────────────
 *  Error
 *    └─ ApiError
 *         └─ NotFoundError
 *
 * Usage
 * ─────
 *  throw NotFoundError.user(userId);
 *  throw NotFoundError.profile(userId);
 *  throw NotFoundError.document(documentId);
 */

import ApiError from "../utils/apiError.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const HTTP_STATUS_NOT_FOUND = 404;

/**
 * @enum {string}
 */
const NOT_FOUND_CODES = Object.freeze({
  USER: "USER_NOT_FOUND",
  PROFILE: "PROFILE_NOT_FOUND",
  DOCUMENT: "DOC_NOT_FOUND",
});

/* ─────────────────────────────────────────────
   CLASS
───────────────────────────────────────────── */

export class NotFoundError extends ApiError {
  /**
   * @param {Object}      params
   * @param {string}      params.message
   * @param {string}      params.code
   * @param {Error|null}  [params.cause]
   */
  constructor({ message, code, cause = null }) {
    super({
      statusCode: HTTP_STATUS_NOT_FOUND,
      message,
      code,
      cause,
      errors: [],
      isOperational: true,
    });

    Object.setPrototypeOf(this, NotFoundError.prototype);
  }

  /* ─────────────────────────────────────────
     STATIC FACTORIES
  ───────────────────────────────────────── */

  /**
   * Creates a 404 for a missing User document.
   *
   * Use when a User.findById() / User.findOne() returns null.
   * Distinct from .profile() — a user and their KYC profile are
   * separate documents; callers should be explicit about which is missing.
   *
   * @param   {string}     userId
   * @param   {Error|null} [cause]
   * @returns {NotFoundError}
   */
  static user(userId, cause = null) {
    return new NotFoundError({
      message: `User "${userId}" not found.`,
      code: NOT_FOUND_CODES.USER,
      cause,
    });
  }

  /**
   * Creates a 404 for a missing Profile document.
   *
   * Use when a Profile.findOne({ user: userId }) returns null.
   *
   * @param   {string}     userId
   * @param   {Error|null} [cause]
   * @returns {NotFoundError}
   */
  static profile(userId, cause = null) {
    return new NotFoundError({
      message: `Profile not found for user "${userId}".`,
      code: NOT_FOUND_CODES.PROFILE,
      cause,
    });
  }

  /**
   * Creates a 404 for a missing document subdocument.
   *
   * @param   {string}     documentId
   * @param   {Error|null} [cause]
   * @returns {NotFoundError}
   */
  static document(documentId, cause = null) {
    return new NotFoundError({
      message: `Document "${documentId}" not found.`,
      code: NOT_FOUND_CODES.DOCUMENT,
      cause,
    });
  }
}
