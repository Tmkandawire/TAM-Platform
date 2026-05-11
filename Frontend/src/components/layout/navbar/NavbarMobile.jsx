/**
 * @file NavbarMobile.jsx
 * @module components/layout/navbar
 *
 * Premium mobile navbar experience:
 *  • Floating glassmorphism drawer
 *  • Smooth motion hierarchy
 *  • Neutral hover interactions
 *  • Soft active states
 *  • Improved tactile feedback
 *  • Accessibility-preserving architecture
 */

import { NavLink } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";

import { CTA_BUTTONS, NAV_LINKS } from "./navbar.config";
import NavButton from "./NavButton";
import { cn } from "../../../utils/cn";

// ─────────────────────────────────────────────────────────────
// Motion Variants
// ─────────────────────────────────────────────────────────────

const BACKDROP_VARIANTS = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.2,
      ease: "easeOut",
    },
  },
};

const MENU_VARIANTS = {
  hidden: {
    opacity: 0,
    y: -10,
    scale: 0.985,
  },

  visible: {
    opacity: 1,
    y: 0,
    scale: 1,

    transition: {
      duration: 0.24,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.045,
      delayChildren: 0.03,
    },
  },

  exit: {
    opacity: 0,
    y: -8,
    scale: 0.985,

    transition: {
      duration: 0.16,
      ease: "easeInOut",
    },
  },
};

const ITEM_VARIANTS = {
  hidden: {
    opacity: 0,
    y: 6,
  },

  visible: {
    opacity: 1,
    y: 0,

    transition: {
      duration: 0.2,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function MobileNavLink({ path, label, end, onClick }) {
  return (
    <motion.div variants={ITEM_VARIANTS}>
      <NavLink
        to={path}
        end={end}
        onClick={onClick}
        className={({ isActive }) =>
          cn(
            // Layout
            "flex items-center px-4 py-3.5 rounded-xl",

            // Typography
            "text-[15px] font-body font-medium",

            // Motion
            "transition-all duration-300 ease-out",
            "transform-gpu will-change-transform",

            // Accessibility
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-primary-500 focus-visible:ring-offset-2",

            // States
            isActive
              ? [
                  "bg-primary-50",
                  "text-primary-700",
                  "border border-primary-100",
                  "shadow-sm",
                ]
              : [
                  "text-gray-700",
                  "hover:bg-gray-100/80",
                  "hover:text-gray-900",
                  "hover:translate-x-0.5",
                  "active:scale-[0.99]",
                ],
          )
        }
      >
        {label}
      </NavLink>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function NavbarMobile({
  mobileOpen,
  toggleMenu,
  closeMenu,
  menuButtonRef,
  mobileDrawerRef,
}) {
  const prefersReducedMotion = useReducedMotion();

  const reducedMotionVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  };

  return (
    <>
      {/* ───────────────── Toggle Button ───────────────── */}
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
          "lg:hidden flex items-center justify-center",

          // Sizing
          "w-11 h-11 rounded-xl",

          // Visual styling
          "bg-white/80 text-gray-700",
          "border border-gray-200/80",
          "shadow-sm backdrop-blur-md",

          // Interaction
          "hover:bg-gray-100",
          "hover:text-gray-900",
          "hover:shadow-md",

          // Motion
          "transition-all duration-300 ease-out",

          // Accessibility
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {mobileOpen ? (
            <motion.span
              key="close"
              initial={{ opacity: 0, rotate: -90, scale: 0.9 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.9 }}
              transition={{ duration: 0.18 }}
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span
              key="menu"
              initial={{ opacity: 0, rotate: 90, scale: 0.9 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -90, scale: 0.9 }}
              transition={{ duration: 0.18 }}
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* ───────────────── Mobile Drawer ───────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={
                prefersReducedMotion ? reducedMotionVariants : BACKDROP_VARIANTS
              }
              onClick={closeMenu}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
            />

            {/* Floating Drawer */}
            <motion.div
              ref={mobileDrawerRef}
              id="mobile-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={
                prefersReducedMotion ? reducedMotionVariants : MENU_VARIANTS
              }
              style={{
                WebkitTapHighlightColor: "transparent",
              }}
              className={cn(
                "fixed top-20 left-4 right-4 z-50",

                // Layout
                "overflow-hidden rounded-3xl",

                // Glassmorphism
                "bg-white/92 backdrop-blur-2xl",

                // Borders & depth
                "border border-white/30",
                "shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)]",

                // Mobile only
                "lg:hidden",
              )}
            >
              {/* Header */}
              <div
                className={cn(
                  "flex items-center justify-between",
                  "px-5 py-4",
                  "border-b border-gray-100/80",
                )}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-900">
                    Navigation
                  </span>

                  <span className="text-xs text-gray-500">
                    Browse the platform
                  </span>
                </div>

                <button
                  type="button"
                  onClick={closeMenu}
                  aria-label="Close menu"
                  className={cn(
                    "flex items-center justify-center",

                    "w-9 h-9 rounded-xl",

                    "text-gray-500",
                    "hover:text-gray-900",
                    "hover:bg-gray-100/80",

                    "transition-all duration-200",

                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary-500",
                  )}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Navigation Content */}
              <div className="px-4 py-4">
                {/* Nav Links */}
                <div className="space-y-1.5">
                  {NAV_LINKS.map(({ path, label, end }) => (
                    <MobileNavLink
                      key={path}
                      path={path}
                      label={label}
                      end={end}
                      onClick={closeMenu}
                    />
                  ))}
                </div>

                {/* CTA Section */}
                <motion.div
                  variants={ITEM_VARIANTS}
                  className={cn(
                    "mt-5 pt-5",
                    "border-t border-gray-100/80",
                    "flex flex-col gap-3",
                  )}
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
          </>
        )}
      </AnimatePresence>
    </>
  );
}
