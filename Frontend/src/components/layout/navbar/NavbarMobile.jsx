/**
 * @file NavbarMobile.jsx
 * @module components/layout/navbar
 *
 * Mobile navbar UI — hamburger trigger + animated drawer.
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 *  • Hamburger toggle button (passes ref for focus restoration)
 *  • Animated mobile drawer (AnimatePresence)
 *  • Full focus trap provided by useNavbar hook via mobileDrawerRef
 *  • Respects prefers-reduced-motion via useReducedMotion()
 *  • Staggered nav link entrance animations
 *  • All interactive elements have visible focus-visible rings
 *
 * Accessibility:
 *   aria-expanded on toggle button (WCAG 4.1.2)
 *   role="dialog" + aria-modal on drawer (WCAG 1.3.1)
 *   Focus trap + Escape key handled in useNavbar.js (WCAG 2.1.2)
 *   Focus restoration to trigger button on close (WCAG 2.4.3)
 */

import { NavLink } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { CTA_BUTTONS } from "./navbar.config";
import { NAV_LINKS } from "./navbar.config";
import {
  MOBILE_MENU_VARIANTS,
  MOBILE_ITEM_VARIANTS,
  REDUCED_MOTION_VARIANTS,
  REDUCED_MOTION_ITEM_VARIANTS,
} from "./navbar.motion";
import NavButton from "./NavButton";
import { cn } from "../../../utils/cn";

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Individual mobile nav link.
 * Left-border active indicator — clearer than background fills on mobile.
 * Larger touch target (py-3) than desktop equivalent.
 */
function MobileNavLink({ path, label, end, index, onClick, itemVariants }) {
  return (
    <motion.div custom={index} variants={itemVariants}>
      <NavLink
        to={path}
        end={end}
        onClick={onClick}
        className={({ isActive }) =>
          cn(
            "flex items-center px-4 py-3 rounded-lg",
            "text-base font-body font-medium",
            "border-l-4 transition-all duration-200",
            // Keyboard focus
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-primary-500 focus-visible:ring-inset",
            // Active vs idle
            isActive
              ? "border-primary-500 text-primary-600 bg-primary-50"
              : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50",
          )
        }
      >
        {label}
      </NavLink>
    </motion.div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   mobileOpen:      boolean,
 *   toggleMenu:      () => void,
 *   closeMenu:       () => void,
 *   menuButtonRef:   React.RefObject<HTMLButtonElement>,
 *   mobileDrawerRef: React.RefObject<HTMLDivElement>,
 * }} props
 *
 * Returns a fragment with two children:
 *   [0] Hamburger button  — rendered inside the nav flex row
 *   [1] Animated drawer   — rendered below the nav bar, expands the header
 */
export default function NavbarMobile({
  mobileOpen,
  toggleMenu,
  closeMenu,
  menuButtonRef,
  mobileDrawerRef,
}) {
  const prefersReducedMotion = useReducedMotion();

  const menuVariants = prefersReducedMotion
    ? REDUCED_MOTION_VARIANTS
    : MOBILE_MENU_VARIANTS;
  const itemVariants = prefersReducedMotion
    ? REDUCED_MOTION_ITEM_VARIANTS
    : MOBILE_ITEM_VARIANTS;
  const transitionConfig = prefersReducedMotion ? { duration: 0 } : undefined;

  return (
    <>
      {/* ── Hamburger toggle button ── */}
      <button
        ref={menuButtonRef}
        type="button"
        onClick={toggleMenu}
        aria-expanded={mobileOpen}
        aria-controls="mobile-nav-drawer"
        aria-label={
          mobileOpen ? "Close navigation menu" : "Open navigation menu"
        }
        className={cn(
          "lg:hidden flex items-center justify-center w-10 h-10 rounded-lg",
          "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
          "transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {mobileOpen ? (
            <motion.span
              key="close"
              initial={{ opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 90 }}
              transition={transitionConfig ?? { duration: 0.15 }}
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span
              key="menu"
              initial={{ opacity: 0, rotate: 90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: -90 }}
              transition={transitionConfig ?? { duration: 0.15 }}
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* ── Mobile drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            ref={mobileDrawerRef}
            id="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            variants={menuVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="lg:hidden overflow-hidden border-t border-gray-100 bg-white"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-1">
              {NAV_LINKS.map(({ path, label, end }, index) => (
                <MobileNavLink
                  key={path}
                  path={path}
                  label={label}
                  end={end}
                  index={index}
                  onClick={closeMenu}
                  itemVariants={itemVariants}
                />
              ))}

              <motion.div
                custom={NAV_LINKS.length}
                variants={itemVariants}
                className="pt-3 mt-3 border-t border-gray-100 flex flex-col gap-2.5"
              >
                {CTA_BUTTONS.map(({ label, path, variant, ariaLabel }) => (
                  <NavButton
                    key={label}
                    to={path}
                    label={label}
                    variant={variant}
                    ariaLabel={ariaLabel}
                    fullWidth
                    onClick={closeMenu}
                  />
                ))}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
