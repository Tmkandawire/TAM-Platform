/**
 * @file NavbarMobile.jsx
 * @module components/layout/navbar
 *
 * Refactored mobile navbar:
 *  • Floating glassmorphism drawer
 *  • Backdrop overlay
 *  • Improved spacing + hierarchy
 *  • Pill-style active nav items
 *  • Enhanced motion polish
 *  • Preserved accessibility architecture
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
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const MENU_VARIANTS = {
  hidden: {
    opacity: 0,
    y: -12,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.22,
      ease: "easeOut",
      staggerChildren: 0.05,
      delayChildren: 0.04,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.98,
    transition: {
      duration: 0.16,
    },
  },
};

const ITEM_VARIANTS = {
  hidden: {
    opacity: 0,
    y: 8,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.18,
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
            "flex items-center px-4 py-3.5 rounded-xl",
            "text-[15px] font-body font-medium",
            "transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
            isActive
              ? "bg-primary-500 text-white shadow-sm"
              : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
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
          "w-11 h-11 rounded-xl",
          "bg-gray-100/80 text-gray-700 shadow-sm",
          "hover:bg-gray-200 hover:text-gray-900",
          "transition-all duration-200",
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
              transition={{ duration: 0.15 }}
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span
              key="menu"
              initial={{ opacity: 0, rotate: 90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: -90 }}
              transition={{ duration: 0.15 }}
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
                prefersReducedMotion
                  ? {
                      hidden: { opacity: 0 },
                      visible: { opacity: 1 },
                    }
                  : BACKDROP_VARIANTS
              }
              onClick={closeMenu}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
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
                prefersReducedMotion
                  ? {
                      hidden: { opacity: 0 },
                      visible: { opacity: 1 },
                      exit: { opacity: 0 },
                    }
                  : MENU_VARIANTS
              }
              className={cn(
                "fixed top-20 left-4 right-4 z-50",
                "rounded-2xl overflow-hidden",
                "border border-white/20",
                "bg-white/95 backdrop-blur-xl",
                "shadow-2xl",
                "lg:hidden",
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-900">
                  Navigation
                </span>

                <button
                  type="button"
                  onClick={closeMenu}
                  aria-label="Close menu"
                  className={cn(
                    "flex items-center justify-center",
                    "w-9 h-9 rounded-lg",
                    "text-gray-500 hover:text-gray-900",
                    "hover:bg-gray-100 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-primary-500",
                  )}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Navigation Links */}
              <div className="px-4 py-4 space-y-1.5">
                {NAV_LINKS.map(({ path, label, end }) => (
                  <MobileNavLink
                    key={path}
                    path={path}
                    label={label}
                    end={end}
                    onClick={closeMenu}
                  />
                ))}

                {/* CTA Section */}
                <motion.div
                  variants={ITEM_VARIANTS}
                  className="pt-4 mt-4 border-t border-gray-100 flex flex-col gap-3"
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
