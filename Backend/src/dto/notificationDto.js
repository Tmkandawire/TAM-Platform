/**
 * @file dto/notificationDto.js
 * @module dto
 *
 * Zod validation schemas for notification route boundaries.
 *
 * Consumed by validate() middleware in notificationRoutes.js.
 * validate() runs safeParse({ body, params, query }) and replaces
 * request data with sanitised values before the controller runs.
 *
 * Schemas:
 *  • notificationQuerySchema  — GET /  (feed pagination + status filter)
 *  • notificationParamsSchema — /:id routes (ObjectId format guard)
 *
 * Shared helpers:
 *  • objectId() — imported from dto/shared/objectId.js, the single
 *    source of truth for ObjectId validation across all DTOs.
 */

import { z } from "zod";
import { NOTIFICATION_STATUS } from "../constants/notificationTypes.js";
import { objectId } from "./shared/objectId.js";

/* ─────────────────────────────────────────────
   SCHEMAS
───────────────────────────────────────────── */

/**
 * Query schema for GET /api/v1/notifications
 *
 * All fields are optional — the controller applies its own defaults
 * when fields are absent. Coercion converts query strings to numbers.
 * An invalid status is rejected rather than silently dropped, so the
 * member receives a clear error instead of an unexpectedly empty feed.
 */
export const notificationQuerySchema = z.object({
  query: z
    .object({
      page: z.coerce
        .number({ invalid_type_error: "page must be a number" })
        .int("page must be an integer")
        .min(1, "page must be at least 1")
        .optional(),

      limit: z.coerce
        .number({ invalid_type_error: "limit must be a number" })
        .int("limit must be an integer")
        .min(1, "limit must be at least 1")
        .max(50, "limit must not exceed 50")
        .optional(),

      status: z
        .string()
        .trim()
        .toUpperCase()
        .refine((val) => Object.values(NOTIFICATION_STATUS).includes(val), {
          message: `status must be one of: ${Object.values(NOTIFICATION_STATUS).join(", ")}`,
        })
        .optional(),
    })
    .strict(),
});

/**
 * Params schema for /:id routes:
 *   PATCH  /:id/read
 *   PATCH  /:id/archive
 *   DELETE /:id
 *
 * Validates the :id segment is a well-formed 24-char hex ObjectId before
 * the controller delegates to the service. Prevents Mongoose CastErrors
 * from surfacing as unhandled 500s on malformed requests.
 */
export const notificationParamsSchema = z.object({
  params: z
    .object({
      id: objectId("id"),
    })
    .strict(),
});
