/**
 * @file broadcastValidator.js
 * @module validators/broadcast
 *
 * Transport-layer validator for broadcast create/send payloads.
 */
import { z } from "zod";
import { NOTIFICATION_TYPE } from "../constants/notificationTypes.js";
import {
  BROADCAST_AUDIENCE_TYPE,
  TITLE_MAX_LENGTH,
  SUBJECT_MAX_LENGTH,
  IDEMPOTENCY_KEY_MAX_LENGTH,
} from "../models/Broadcast.js";
import { normalizeZodErrors } from "../shared/normalizeZodErrors.js";
import {
  buildValidationFailure,
  buildValidationSuccess,
} from "../shared/buildValidation.js";

const MESSAGE_TRANSPORT_MAX_LENGTH = 10_000;
const IDEMPOTENCY_KEY_MIN_LENGTH = 16;

const ROOT_PAYLOAD_ERROR = Object.freeze([
  Object.freeze({
    field: "root",
    message: "Request body must be a non-null JSON object.",
    code: "invalid_type",
  }),
]);

const objectIdPattern = /^[a-f\d]{24}$/i;

const broadcastPayloadSchema = z
  .object({
    title: z.string().trim().min(1).max(TITLE_MAX_LENGTH),
    subject: z.string().trim().min(1).max(SUBJECT_MAX_LENGTH),
    message: z.string().trim().min(1).max(MESSAGE_TRANSPORT_MAX_LENGTH),
    idempotencyKey: z
      .string()
      .trim()
      .min(IDEMPOTENCY_KEY_MIN_LENGTH)
      .max(IDEMPOTENCY_KEY_MAX_LENGTH),
    audienceType: z.enum(Object.values(BROADCAST_AUDIENCE_TYPE)),
    sendToAllUsers: z.boolean().optional().default(false),
    audienceFilters: z
      .object({
        roles: z.array(z.string().trim().min(1)).min(1).optional(),
        statuses: z.array(z.string().trim().min(1)).min(1).optional(),
        userIds: z.array(z.string().regex(objectIdPattern)).min(1).optional(),
      })
      .strict()
      .optional()
      .default({}),
    notificationType: z
      .enum(Object.values(NOTIFICATION_TYPE))
      .optional()
      .default(NOTIFICATION_TYPE.BROADCAST),
    metadata: z.record(z.unknown()).optional().default({}),
    createdByAdmin: z.string().regex(objectIdPattern),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.audienceType === BROADCAST_AUDIENCE_TYPE.ALL &&
      value.sendToAllUsers !== true
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sendToAllUsers"],
        message:
          'audienceType "ALL" requires sendToAllUsers: true to confirm intent.',
      });
    }
    if (value.audienceType === BROADCAST_AUDIENCE_TYPE.FILTERED) {
      const hasAtLeastOneFilter =
        (value.audienceFilters.roles?.length ?? 0) > 0 ||
        (value.audienceFilters.statuses?.length ?? 0) > 0 ||
        (value.audienceFilters.userIds?.length ?? 0) > 0;
      if (!hasAtLeastOneFilter) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["audienceFilters"],
          message:
            "FILTERED audience requires at least one filter (roles, statuses, or userIds).",
        });
      }
    }
  });

export function validateBroadcastPayload(rawBody) {
  const invalidRootPayload =
    rawBody === null ||
    rawBody === undefined ||
    typeof rawBody !== "object" ||
    Array.isArray(rawBody);

  if (invalidRootPayload) {
    return buildValidationFailure(ROOT_PAYLOAD_ERROR);
  }

  const parsed = broadcastPayloadSchema.safeParse(rawBody);

  if (!parsed.success) {
    return buildValidationFailure(normalizeZodErrors(parsed.error));
  }

  return buildValidationSuccess(parsed.data);
}

export default validateBroadcastPayload;
export { broadcastPayloadSchema as broadcastSchema };
