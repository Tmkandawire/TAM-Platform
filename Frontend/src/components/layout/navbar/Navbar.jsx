/**
 * @file Navbar.jsx
 * @module components/layout/navbar
 *
 * TAM Public Navbar — thin orchestrator.
 *
 * This file's only job is to:
 *   1. Call useNavbar() to get all behaviour state and refs
 *   2. Compose TAMLogo + NavbarDesktop + NavbarMobile into a shell
 *   3. Apply the scroll shadow and sticky positioning
 *
 * Zero business logic lives here.
 * Zero inline Tailwind class strings that aren't structural.
 *
 * Architecture overview:
 * ┌─────────────────────────────────────────────────┐
 * │  Navbar.jsx          ← orchestrator (this file) │
 * │    ├── useNavbar.js  ← all behaviour + state    │
 * │    ├── TAMLogo.jsx   ← reusable logo mark       │
 * │    ├── NavbarDesktop ← desktop nav + CTAs       │
 * │    └── NavbarMobile  ← hamburger + drawer       │
 * │          └── NavButton.jsx  ← CTA abstraction   │
 * │  navbar.config.js    ← all data + variants      │
 * └─────────────────────────────────────────────────┘
 *
 * Usage:
 *   Import Navbar into PublicLayout — it self-manages scroll,
 *   mobile state, focus trap, and route-change close behaviour.
 *
 *   <Navbar />
 */

import { useNavbar } from "./useNavbar";
import TAMLogo from "./TAMLogo";
import NavbarDesktop from "./NavbarDesktop";
import NavbarMobile from "./NavbarMobile";

// ─── Component ────────────────────────────────────────────────────────────────

export default function Navbar() {
  const {
    isScrolled,
    mobileOpen,
    toggleMenu,
    closeMenu,
    menuButtonRef,
    mobileDrawerRef,
  } = useNavbar();

  return (
    <>
      {/*
       * Red top-accent bar — 3px brand anchor.
       * Fixed independently so it stays above the navbar z-stack.
       */}
      <div
        aria-hidden="true"
        className="fixed top-0 left-0 right-0 h-[3px] bg-primary-gradient z-[51]"
      />

      {/* ── Navbar shell ── */}
      <header
        role="banner"
        className={[
          "fixed top-[3px] left-0 right-0 z-50 bg-white",
          "transition-shadow duration-300",
          isScrolled ? "shadow-md" : "shadow-none border-b border-gray-100",
        ].join(" ")}
      >
        {/*
         * Skip-to-content link — invisible until focused.
         * Required for keyboard-only users to bypass the navbar.
         * Links to #main-content defined in PublicLayout.
         */}
        <a
          href="#main-content"
          className={[
            "sr-only focus:not-sr-only",
            "focus:absolute focus:top-2 focus:left-4",
            "focus:z-50 focus:px-4 focus:py-2",
            "focus:rounded-lg focus:bg-primary-500 focus:text-white",
            "focus:text-sm focus:font-body focus:font-semibold",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-white focus-visible:ring-offset-2",
            "focus-visible:ring-offset-primary-500",
          ].join(" ")}
        >
          Skip to main content
        </a>

        <nav
          aria-label="Main navigation"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
        >
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <TAMLogo />

            {/* Desktop: nav links + CTA buttons (hidden on mobile) */}
            <NavbarDesktop />

            {/* Mobile: hamburger + drawer (hidden on desktop) */}
            <NavbarMobile
              mobileOpen={mobileOpen}
              toggleMenu={toggleMenu}
              closeMenu={closeMenu}
              menuButtonRef={menuButtonRef}
              mobileDrawerRef={mobileDrawerRef}
            />
          </div>
        </nav>
      </header>

      {/*
       * Layout spacer — pushes page content below the fixed navbar.
       * 3px accent bar + 64px nav height = 67px total offset.
       */}
      <div className="h-[67px]" aria-hidden="true" />
    </>
  );
}
