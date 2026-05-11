/**
 * @file navbar.motion.js
 * @module components/layout/navbar
 *
 * Framer Motion variants for all navbar animations.
 *
 * Separated from navbar.config.js because motion concerns evolve
 * independently from navigation data — timing, easing, and reduced-motion
 * strategy are owned by different concerns than link structure and CTA intent.
 *
 * Consumers:
 *   NavbarMobile.jsx — imports all four variants
 */

// ─── Mobile Drawer ────────────────────────────────────────────────────────────

/**
 * Full animation variants for the mobile menu drawer.
 * Used when prefers-reduced-motion is false.
 */
export const MOBILE_MENU_VARIANTS = {
  hidden: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.25, ease: "easeInOut" },
  },
  visible: {
    opacity: 1,
    height: "auto",
    transition: { duration: 0.3, ease: "easeInOut" },
  },
};

/**
 * Staggered entrance variants for individual mobile nav links.
 * `custom` prop = index, used to calculate per-item animation delay.
 */
export const MOBILE_ITEM_VARIANTS = {
  hidden: { opacity: 0, x: -16 },
  visible: (i) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.05, duration: 0.25, ease: "easeOut" },
  }),
};

// ─── Reduced Motion Alternatives ─────────────────────────────────────────────

/**
 * Instant variants swapped in when prefers-reduced-motion is set.
 * Preserves structural visibility behaviour without any animation.
 */
export const REDUCED_MOTION_VARIANTS = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: "auto" },
};

export const REDUCED_MOTION_ITEM_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};
