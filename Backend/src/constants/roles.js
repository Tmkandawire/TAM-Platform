/**
 * 🔐 ROLE CONSTANTS — Single Source of Truth
 * Never hardcode role strings in routes or middleware.
 * Always import from here.
 */
export const ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  REVIEWER: "reviewer",
  MEMBER: "member",
});

export const ALL_ROLES = Object.freeze(Object.values(ROLES));

/**
 * Normalize role input so every role utility behaves consistently.
 */
export const normalizeRole = (role) => {
  if (role == null) return "";
  return String(role).trim().toLowerCase();
};

/**
 * Numeric hierarchy — higher = more powerful.
 */
export const ROLE_HIERARCHY = Object.freeze({
  [ROLES.SUPER_ADMIN]: 4,
  [ROLES.ADMIN]: 3,
  [ROLES.REVIEWER]: 2,
  [ROLES.MEMBER]: 1,
});

/**
 * Roles allowed to perform broadcast actions.
 */
export const BROADCAST_ALLOWED_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
]);

/**
 * Read-only roles. Kept as an array intentionally for easy future extension.
 */
export const READ_ONLY_ROLES = Object.freeze([ROLES.REVIEWER]);

/**
 * Runtime guard for role validation.
 */
export const isValidRole = (role = "") =>
  ALL_ROLES.includes(normalizeRole(role));

/**
 * Compares two roles based on the hierarchy map.
 */
export const hasMinimumRole = (role, minimumRole) => {
  const normalizedRole = normalizeRole(role);
  const normalizedMinimumRole = normalizeRole(minimumRole);

  if (
    !ALL_ROLES.includes(normalizedRole) ||
    !ALL_ROLES.includes(normalizedMinimumRole)
  ) {
    return false;
  }

  return (
    ROLE_HIERARCHY[normalizedRole] >= ROLE_HIERARCHY[normalizedMinimumRole]
  );
};
