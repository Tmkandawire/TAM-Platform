/**

* @file notificationValidator.js
* @module validators
*
* Enterprise-grade validation layer for notification inputs.
  */

import {
  NOTIFICATION_TYPE,
  NOTIFICATION_STATUS,
} from "../constants/notificationTypes.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const TITLE_MAX_LENGTH = 120;
const MESSAGE_MAX_LENGTH = 2000;
const TYPE_MIN_LENGTH = 3;
const TYPE_MAX_LENGTH = 100;
const BULK_CREATE_LIMIT = 500;
const MAX_PAGE_SIZE = 100;

/* ─────────────────────────────────────────────
   RESULT BUILDERS
───────────────────────────────────────────── */

function pass() {
  return Object.freeze({ valid: true });
}

function fail(errors) {
  return Object.freeze({
    valid: false,
    errors: Object.freeze([...errors]),
  });
}

/* ─────────────────────────────────────────────
   PRIMITIVE RULES
───────────────────────────────────────────── */

function checkObjectId(value, field) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    return `${field}: must be a valid 24-character hex ObjectId string`;
  }
  return null;
}

function checkNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return `${field}: must be a non-empty string`;
  }
  return null;
}

function checkMaxLength(value, field, max) {
  if (typeof value === "string" && value.trim().length > max) {
    return `${field}: must not exceed ${max} characters`;
  }
  return null;
}

function checkMinLength(value, field, min) {
  if (typeof value === "string" && value.trim().length < min) {
    return `${field}: must be at least ${min} characters`;
  }
  return null;
}

/**
 * Fix 2: replaced `typeof value` with JSON.stringify(value).
 *
 * The previous implementation used `typeof value` as the display value
 * when the input was not a string — producing messages like
 * "received number" instead of "received 42". JSON.stringify handles
 * all types safely and gives callers the actual value, not the type name.
 */
function checkEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    return `${field}: must be one of [${allowed.join(", ")}] (received ${JSON.stringify(value) ?? String(value)})`;
  }
  return null;
}

/**
 * Strict plain object validation (enterprise-grade).
 *
 * Rejects class instances, Dates, Maps, RegExps and any other value
 * whose prototype is not Object.prototype or null.
 */
function checkPlainObject(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return `${field}: must be a plain object`;
  }

  const proto = Object.getPrototypeOf(value);

  if (proto !== Object.prototype && proto !== null) {
    return `${field}: must be a plain object`;
  }

  return null;
}

function checkPositiveInteger(value, field, max) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return `${field}: must be a positive integer`;
  }

  if (max !== undefined && parsed > max) {
    return `${field}: must not exceed ${max}`;
  }

  return null;
}

/* ─────────────────────────────────────────────
   INTERNAL COMPOSITE VALIDATOR
───────────────────────────────────────────── */

function collectDtoErrors(dto, context = "dto") {
  const errors = [];

  if (dto === null || typeof dto !== "object" || Array.isArray(dto)) {
    errors.push(`${context}: must be a plain object`);
    return errors;
  }

  const prefix = (field) => `${context}.${field}`;

  // user
  const userIdError = checkObjectId(dto.user, prefix("user"));
  if (userIdError) errors.push(userIdError);

  // type (STRICT — no normalization)
  const typeRequired = checkNonEmptyString(dto.type, prefix("type"));
  if (typeRequired) {
    errors.push(typeRequired);
  } else {
    const typeMin = checkMinLength(dto.type, prefix("type"), TYPE_MIN_LENGTH);
    const typeMax = checkMaxLength(dto.type, prefix("type"), TYPE_MAX_LENGTH);
    const typeEnum = checkEnum(
      dto.type,
      prefix("type"),
      Object.values(NOTIFICATION_TYPE),
    );

    if (typeMin) errors.push(typeMin);
    if (typeMax) errors.push(typeMax);
    if (typeEnum) errors.push(typeEnum);
  }

  // title
  const titleRequired = checkNonEmptyString(dto.title, prefix("title"));
  if (titleRequired) {
    errors.push(titleRequired);
  } else {
    const titleMax = checkMaxLength(
      dto.title,
      prefix("title"),
      TITLE_MAX_LENGTH,
    );
    if (titleMax) errors.push(titleMax);
  }

  // message
  const messageRequired = checkNonEmptyString(dto.message, prefix("message"));
  if (messageRequired) {
    errors.push(messageRequired);
  } else {
    const messageMax = checkMaxLength(
      dto.message,
      prefix("message"),
      MESSAGE_MAX_LENGTH,
    );
    if (messageMax) errors.push(messageMax);
  }

  // metadata
  if (dto.metadata !== undefined) {
    const metadataError = checkPlainObject(dto.metadata, prefix("metadata"));
    if (metadataError) errors.push(metadataError);
  }

  return errors;
}

/* ─────────────────────────────────────────────
   PUBLIC API
───────────────────────────────────────────── */

const notificationValidator = {
  validateCreateDto(dto) {
    const errors = collectDtoErrors(dto, "dto");
    return errors.length ? fail(errors) : pass();
  },

  validateBulkCreateDtos(dtos) {
    const errors = [];

    if (!Array.isArray(dtos) || dtos.length === 0) {
      errors.push("dtos: must be a non-empty array");
      return fail(errors);
    }

    if (dtos.length > BULK_CREATE_LIMIT) {
      errors.push(`dtos: exceeds bulk limit of ${BULK_CREATE_LIMIT}`);
      return fail(errors);
    }

    for (let i = 0; i < dtos.length; i++) {
      errors.push(...collectDtoErrors(dtos[i], `dtos[${i}]`));
    }

    return errors.length ? fail(errors) : pass();
  },

  validateNotificationId(notificationId) {
    const error = checkObjectId(notificationId, "notificationId");
    return error ? fail([error]) : pass();
  },

  validateUserId(userId) {
    const error = checkObjectId(userId, "userId");
    return error ? fail([error]) : pass();
  },

  /**
   * Fix 1: replaced inline typeof check with checkPlainObject().
   *
   * The previous implementation used a manual typeof/null/Array check,
   * which accepts class instances (new Map(), new Date(), etc.).
   * checkPlainObject() additionally validates the prototype chain,
   * rejecting anything that is not a genuine plain object — consistent
   * with how metadata is validated in collectDtoErrors.
   */
  validateQueryOptions(options = {}) {
    const errors = [];

    const objectError = checkPlainObject(options, "options");
    if (objectError) return fail([objectError]);

    if (options.page !== undefined) {
      const err = checkPositiveInteger(options.page, "options.page");
      if (err) errors.push(err);
    }

    if (options.limit !== undefined) {
      const err = checkPositiveInteger(
        options.limit,
        "options.limit",
        MAX_PAGE_SIZE,
      );
      if (err) errors.push(err);
    }

    if (options.status !== undefined) {
      const err = checkEnum(
        options.status,
        "options.status",
        Object.values(NOTIFICATION_STATUS),
      );
      if (err) errors.push(err);
    }

    return errors.length ? fail(errors) : pass();
  },
};

export default Object.freeze(notificationValidator);
