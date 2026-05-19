/**
 * @file dto/notificationDto.js
 * @module dto
 *
 * Zod validation schemas for notification route boundaries.
 *
 * FIX: The existing validate() middleware always passes req.body to the
 * schema (schema.safeParse(req.body)). GET routes have no body — query
 * params live in req.query. The original schema was shaped as
 * { query: z.object({...}) } but validate() never passed req.query,
 * so page/limit/status were never coerced and reached the repository
 * as raw strings (or undefined).
 *
 * Solution: notificationQuerySchema is now a flat schema that validates
 * the query param fields directly. The route uses validateQuery() instead
 * of validate() — validateQuery() calls safeParse(req.query) and writes
 * the coerced values back to req.query so the controller sees numbers/strings.
 *
 * notificationParamsSchema stays as-is — validate() already receives
 * req.body on PATCH/DELETE, but params need the same treatment via
 * validateParams() below.
 */

import { z } from "zod";
import { NOTIFICATION_STATUS } from "../constants/notificationTypes.js";
import { objectId } from "./shared/objectId.js";
import ApiError from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/* ─────────────────────────────────────────────
   SCHEMAS
───────────────────────────────────────────── */

/**
 * Flat query schema for GET /api/v1/notifications
 *
 * Validated against req.query (not req.body) via validateQuery() below.
 * z.coerce converts the string "1" → number 1, etc.
 * status is optional — omitting it returns all statuses (the "ALL" tab).
 */
export const notificationQuerySchema = z.object({
  page: z.coerce
    .number({ invalid_type_error: "page must be a number" })
    .int("page must be an integer")
    .min(1, "page must be at least 1")
    .optional()
    .default(1),

  limit: z.coerce
    .number({ invalid_type_error: "limit must be a number" })
    .int("limit must be an integer")
    .min(1, "limit must be at least 1")
    .max(50, "limit must not exceed 50")
    .optional()
    .default(20),

  status: z
    .string()
    .trim()
    .toUpperCase()
    .refine((val) => Object.values(NOTIFICATION_STATUS).includes(val), {
      message: `status must be one of: ${Object.values(NOTIFICATION_STATUS).join(", ")}`,
    })
    .optional(),
});

/**
 * Params schema for /:id routes.
 * Used via validateParams() below — validates req.params, not req.body.
 */
export const notificationParamsSchema = z.object({
  id: objectId("id"),
});

/* ─────────────────────────────────────────────
   MIDDLEWARE FACTORIES
   These replace validate() for GET and parameterised routes
   where the data lives in req.query / req.params, not req.body.
───────────────────────────────────────────── */

/**
 * Validates and coerces req.query against the provided schema.
 * Writes sanitised values back to req.query.
 *
 * Use this instead of validate() for GET routes that have query params.
 *
 * @param {import("zod").ZodSchema} schema
 */
export const validateQuery = (schema) => (req, res, next) => {
  try {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const formattedErrors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      logger.warn("Query validation failed", {
        path: req.originalUrl,
        method: req.method,
        errors: formattedErrors,
      });

      return next(
        new ApiError(
          400,
          "Validation failed",
          formattedErrors,
          "VALIDATION_ERROR",
        ),
      );
    }

    req.query = result.data;
    next();
  } catch (err) {
    logger.error("validateQuery middleware error", {
      error: err.message,
      path: req.originalUrl,
    });
    next(err);
  }
};

/**
 * Validates req.params against the provided schema.
 * Writes sanitised values back to req.params.
 *
 * Use this instead of validate() for routes with :id params.
 *
 * @param {import("zod").ZodSchema} schema
 */
export const validateParams = (schema) => (req, res, next) => {
  try {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const formattedErrors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      logger.warn("Params validation failed", {
        path: req.originalUrl,
        method: req.method,
        errors: formattedErrors,
      });

      return next(
        new ApiError(
          400,
          "Validation failed",
          formattedErrors,
          "VALIDATION_ERROR",
        ),
      );
    }

    req.params = result.data;
    next();
  } catch (err) {
    logger.error("validateParams middleware error", {
      error: err.message,
      path: req.originalUrl,
    });
    next(err);
  }
};
