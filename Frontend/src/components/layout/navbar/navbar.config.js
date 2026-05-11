/**
 * @file navbar.config.js
 * @module components/layout/navbar
 *
 * Single source of truth for all navbar content and CTA definitions.
 *
 * Separating config from UI means:
 *  - Adding/removing nav links requires no changes to component logic
 *  - CTA variants are centrally defined and reused across Desktop + Mobile
 *  - Easier to unit-test config shape independently of render output
 *
 * Animation variants live in navbar.motion.js — motion concerns are
 * intentionally separated so they can evolve independently.
 */

// ─── Navigation Links ─────────────────────────────────────────────────────────

/**
 * Primary navigation links rendered in the navbar.
 * `end` controls React Router's NavLink exact matching:
 *   true  → only active when path matches exactly (used for "/" to avoid
 *            matching every route)
 *   false → active when path starts with the value (useful for nested routes)
 *
 * @type {Array<{ label: string, path: string, end: boolean }>}
 */
export const NAV_LINKS = [
  { label: "Home", path: "/", end: true },
  { label: "About", path: "/about", end: false },
  { label: "Services", path: "/services", end: false },
  { label: "Contact", path: "/contact", end: false },
];

// ─── CTA Button Definitions ───────────────────────────────────────────────────

/**
 * CTA button variants.
 *
 * Intent is explicit:
 *   "ghost"   → returning users who already have an account (Login)
 *   "primary" → new users creating a platform account (Register)
 *   "success" → prospective members joining the association (Join TAM)
 *
 * Register  → platform account creation (digital, handled by auth flow)
 * Join TAM  → association membership enquiry (links to contact/membership info)
 *             Differentiated from Register so users understand the two
 *             distinct actions available to them.
 *
 * @type {Array<{ label: string, path: string, variant: 'ghost'|'primary'|'success', ariaLabel: string }>}
 */
export const CTA_BUTTONS = [
  {
    label: "Login",
    path: "/login",
    variant: "success",
    ariaLabel: "Login to your TAM member account",
  },
  {
    label: "Register",
    path: "/register",
    variant: "primary",
    ariaLabel: "Create a new TAM platform account",
  },
];
