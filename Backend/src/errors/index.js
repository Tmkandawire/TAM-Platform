/**
 * @file index.js
 * @module errors
 * @description Barrel export for all typed error classes in the TAM Platform.
 *
 * Responsibilities
 * ─────────────────
 *  • Re-export every typed error class from a single entry point so
 *    call sites use one import path regardless of which error class
 *    they need
 *  • Serve as the authoritative registry of the platform's public error
 *    surface — if a class is not exported here, it does not exist as far
 *    as the rest of the codebase is concerned
 *
 * This module intentionally does NOT:
 *  • Define any error logic — each class lives in its own file
 *  • Re-export ApiError — ApiError is the internal base class and is
 *    not part of the public error surface; call sites throw typed errors,
 *    never raw ApiError instances
 *  • Export internal-only error classes (e.g. future InternalError,
 *    DatabaseError) — those remain importable directly from their own
 *    files but are deliberately excluded here to keep the public surface
 *    minimal and intentional
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  REGISTRATION CHECKLIST — complete BOTH steps for every new class  │
 * │                                                                     │
 * │  Step 1 → Create the class file in src/errors/ following the       │
 * │           established pattern:                                      │
 * │             - Extend ApiError                                       │
 * │             - Hardcode statusCode                                   │
 * │             - Define VALID_CODES from a frozen object               │
 * │             - Validate message, code, and cause in the constructor  │
 * │             - Expose static factories; factories delegate to        │
 * │               constructor for validation                            │
 * │             - Call Object.setPrototypeOf in the constructor         │
 * │                                                                     │
 * │  Step 2 → Add the export line below in HTTP status code order      │
 * │           AND add an entry to the taxonomy table in this file      │
 * │                                                                     │
 * │  A class that exists in src/errors/ but is missing from this file  │
 * │  is NOT part of the platform error surface. Omitting Step 2 is     │
 * │  silent architectural drift — it will not cause a build error but  │
 * │  will cause inconsistent usage across the codebase.                │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Public error taxonomy (keep in sync with exports below)
 * ─────────────────────────────────────────────────────────
 *  HTTP 400 — ValidationError          Bad input (Zod failures, DTO rule violations)
 *  HTTP 401 — UnauthorizedError        Identity unknown or unverified (missing/expired/invalid token, bad credentials)
 *  HTTP 403 — ForbiddenError           Identity known but access denied (role, policy)
 *  HTTP 404 — NotFoundError            Resource does not exist (profile, document)
 *  HTTP 409 — ConflictError            Request valid but contradicts resource state (document state, duplicate field)
 *  HTTP 503 — ServiceUnavailableError  Infrastructure failure (Redis, SMTP, Cloudinary)
 *
 * Usage
 * ─────
 *  import {
 *    ValidationError,
 *    UnauthorizedError,
 *    ForbiddenError,
 *    NotFoundError,
 *    ConflictError,
 *    ServiceUnavailableError,
 *  } from "../errors/index.js";
 *
 *  // or — import only what you need
 *  import { NotFoundError } from "../errors/index.js";
 */

/* ─────────────────────────────────────────────────────────────────────────
   PUBLIC ERROR SURFACE
   Ordered by HTTP status code.
   Every entry here MUST have a corresponding row in the taxonomy table above.
───────────────────────────────────────────────────────────────────────── */

export { ValidationError } from "./ValidationError.js";
export { UnauthorizedError } from "./UnauthorizedError.js";
export { ForbiddenError } from "./ForbiddenError.js";
export { NotFoundError } from "./NotFoundError.js";
export { ConflictError } from "./ConflictError.js";
export { ServiceUnavailableError } from "./ServiceUnavailableError.js";
