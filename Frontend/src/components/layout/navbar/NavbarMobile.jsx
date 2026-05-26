/**
 * @file NavbarMobile.jsx
 * @module components/layout/navbar
 *
 * Premium mobile navigation panel.
 *
 * Design direction: refined institutional — frosted glass floating panel,
 * mechanical stagger, TAM red active states, crisp typographic hierarchy.
 *
 * Architecture preserved from original:
 *  • useReducedMotion — zero animation when OS setting is on
 *  • aria-expanded / aria-controls / aria-modal — full accessibility
 *  • Focus management via menuButtonRef / mobileDrawerRef
 *  • AnimatePresence for mount/unmount lifecycle
 *
 * Fix: menu no longer closes when tapping an already-active link.
 *  • Removed onClick={closeMenu} from nav links and CTA buttons.
 *  • Added useEffect that watches location.pathname — closes menu only
 *    when the route actually changes (i.e. real navigation occurred).
 *  • Added e.stopPropagation() on the panel so backdrop clicks can
 *    never bubble through and dismiss it unexpectedly.
 */

import { useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";

import { CTA_BUTTONS, NAV_LINKS } from "./navbar.config";
import NavButton from "./NavButton";
import { cn } from "../../../utils/cn";

/* ─────────────────────────────────────────────────────────────────────────────
   MOTION VARIANTS
───────────────────────────────────────────────────────────────────────────── */

const REDUCED = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

const BACKDROP = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.18, ease: "easeIn" } },
};

const PANEL = {
  hidden: {
    opacity: 0,
    y: -8,
    scale: 0.97,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.26,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.055,
      delayChildren: 0.06,
    },
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.97,
    transition: {
      duration: 0.18,
      ease: "easeIn",
    },
  },
};

const ITEM = {
  hidden: { opacity: 0, x: -6 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────────────────────────────────────── */

/**
 * Single nav link row inside the mobile panel.
 * Active state uses TAM red background — institutional authority.
 *
 * onClick is intentionally omitted here. The parent closes the menu
 * via a useEffect on location.pathname, so tapping an already-active
 * link no longer dismisses the panel with no visible effect.
 */
function MobileNavLink({ path, label, end }) {
  return (
    <motion.div variants={ITEM}>
      <NavLink
        to={path}
        end={end}
        className={({ isActive }) =>
          cn(
            // Layout
            "flex items-center gap-3 px-4 py-3 rounded-xl",

            // Typography
            "text-[15px] font-medium tracking-[-0.01em]",

            // Motion
            "transition-all duration-200",

            // Accessibility
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-tam-red focus-visible:ring-offset-2",

            isActive
              ? [
                  "bg-red-50",
                  "text-red-700",
                  "border border-red-100",
                  "shadow-sm",
                ]
              : [
                  "text-gray-700",
                  "hover:bg-gray-100",
                  "hover:text-gray-900",
                  "active:scale-[0.985]",
                ],
          )
        }
      >
        {({ isActive }) => (
          <>
            {/* Active indicator dot */}
            <span
              className={cn(
                "flex-shrink-0 w-1.5 h-1.5 rounded-full transition-all duration-200",
                isActive ? "bg-red-500" : "bg-gray-300",
              )}
              aria-hidden="true"
            />

            {label}
          </>
        )}
      </NavLink>
    </motion.div>
  );
}

/**
 * Hamburger / close toggle button.
 * Sized for comfortable mobile tap target (44px).
 */
function MenuToggle({ mobileOpen, toggleMenu, menuButtonRef }) {
  return (
    <button
      ref={menuButtonRef}
      type="button"
      onClick={toggleMenu}
      aria-expanded={mobileOpen}
      aria-controls="mobile-nav-panel"
      aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
      className={cn(
        "lg:hidden flex items-center justify-center",
        "w-11 h-11 rounded-xl",

        // Surface
        "bg-white border border-gray-200/80",
        "shadow-sm",

        // States
        "hover:bg-gray-50 hover:shadow-md hover:border-gray-300",
        "active:scale-[0.94]",

        // Motion
        "transition-all duration-200",

        // Accessibility
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-tam-red focus-visible:ring-offset-2",
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {mobileOpen ? (
          <motion.span
            key="close"
            initial={{ opacity: 0, rotate: -90, scale: 0.85 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.85 }}
            transition={{ duration: 0.16, ease: "easeInOut" }}
            className="flex items-center justify-center"
          >
            <X className="w-[18px] h-[18px] text-gray-700" aria-hidden="true" />
          </motion.span>
        ) : (
          <motion.span
            key="menu"
            initial={{ opacity: 0, rotate: 90, scale: 0.85 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -90, scale: 0.85 }}
            transition={{ duration: 0.16, ease: "easeInOut" }}
            className="flex items-center justify-center"
          >
            <Menu
              className="w-[18px] h-[18px] text-gray-700"
              aria-hidden="true"
            />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */

export default function NavbarMobile({
  mobileOpen,
  toggleMenu,
  closeMenu,
  menuButtonRef,
  mobileDrawerRef,
}) {
  const prefersReducedMotion = useReducedMotion();
  const location = useLocation();

  /**
   * Close the menu whenever the route actually changes.
   * isMounted ref skips the effect on initial render — without it,
   * landing on a page (e.g. /about) would immediately call closeMenu()
   * and make the hamburger button appear broken on first load.
   */
  const isMounted = useRef(false);
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    closeMenu();
  }, [location.pathname]);

  const backdropVariants = prefersReducedMotion ? REDUCED : BACKDROP;
  const panelVariants = prefersReducedMotion ? REDUCED : PANEL;

  return (
    <>
      {/* ── Toggle button ──────────────────────────────────────────────── */}
      <MenuToggle
        mobileOpen={mobileOpen}
        toggleMenu={toggleMenu}
        menuButtonRef={menuButtonRef}
      />

      {/* ── Panel + backdrop ───────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop — click to close */}
            <motion.div
              key="backdrop"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              onClick={closeMenu}
              aria-hidden="true"
              className={cn(
                "fixed inset-0 z-40 lg:hidden",
                "bg-black/30 backdrop-blur-[2px]",
              )}
            />

            {/* Floating panel */}
            <motion.div
              key="panel"
              ref={mobileDrawerRef}
              id="mobile-nav-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              // Prevent backdrop clicks from bubbling up through the panel
              // and triggering closeMenu when interacting with panel content.
              onClick={(e) => e.stopPropagation()}
              className={cn(
                // Position — sits just below the navbar
                "fixed top-[72px] left-3 right-3 z-50 lg:hidden",

                // Shape
                "rounded-2xl overflow-hidden",

                // Surface — frosted glass
                "bg-white/95 backdrop-blur-xl",

                // Depth
                "border border-gray-200/60",
                "shadow-[0_24px_48px_-12px_rgba(0,0,0,0.20),0_0_0_1px_rgba(0,0,0,0.04)]",
              )}
            >
              {/* ── Panel header ─────────────────────────────────────── */}
              <motion.div
                variants={ITEM}
                className={cn(
                  "flex items-center justify-between",
                  "px-5 py-4",
                  "border-b border-gray-100",
                )}
              >
                <div className="flex items-center gap-2.5">
                  {/* TAM red accent bar */}
                  <span
                    className="w-1 h-5 rounded-full bg-tam-red"
                    aria-hidden="true"
                  />
                  <span className="text-[13px] font-semibold text-gray-500 uppercase tracking-widest">
                    Menu
                  </span>
                </div>

                <button
                  type="button"
                  onClick={closeMenu}
                  aria-label="Close menu"
                  className={cn(
                    "flex items-center justify-center",
                    "w-8 h-8 rounded-lg",
                    "text-gray-400 hover:text-gray-700",
                    "hover:bg-gray-100",
                    "transition-all duration-150",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-tam-red",
                  )}
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </motion.div>

              {/* ── Nav links ────────────────────────────────────────── */}
              <div className="px-3 pt-3 pb-2 space-y-1">
                {NAV_LINKS.map(({ path, label, end }) => (
                  <MobileNavLink
                    key={path}
                    path={path}
                    label={label}
                    end={end}
                  />
                ))}
              </div>

              {/* ── CTA section ──────────────────────────────────────── */}
              <motion.div
                variants={ITEM}
                className={cn(
                  "px-3 pt-3 pb-4",
                  "border-t border-gray-100",
                  "flex flex-col gap-2.5",
                  "mt-1",
                )}
              >
                {/* Subtle section label */}
                <p className="px-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  Get started
                </p>

                {CTA_BUTTONS.map(({ label, path, variant, ariaLabel }) => (
                  <NavButton
                    key={label}
                    to={path}
                    label={label}
                    variant={variant}
                    ariaLabel={ariaLabel}
                    fullWidth
                  />
                ))}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
