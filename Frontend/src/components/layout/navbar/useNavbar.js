/**
 * @file useNavbar.js
 * @module components/layout/navbar
 *
 * Navbar behaviour orchestrator hook.
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 *  • Scroll shadow trigger (passive listener)
 *  • Mobile menu open/close state
 *  • Auto-close on route change
 *  • Delegates scroll locking  → useScrollLock
 *  • Delegates focus trapping  → useFocusTrap
 *
 * What was removed from this file vs the previous version:
 *  • setTimeout(50) for focus  — replaced by useLayoutEffect + rAF in useFocusTrap
 *  • document.body.style.overflow = "" — replaced by non-destructive useScrollLock
 *  • Raw keydown listener for Tab/Escape — now lives in useFocusTrap
 *  • getFocusableEdges utility — now lives in useFocusTrap
 *
 * This hook is now a thin orchestrator.
 * Each concern is independently extractable and unit-testable.
 *
 * Returns a stable API consumed by Navbar.jsx and passed to sub-components.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useFocusTrap } from "../../../hooks/useFocusTrap";
import { useScrollLock } from "../../../hooks/useScrollLock";

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @returns {{
 *   isScrolled:      boolean,
 *   mobileOpen:      boolean,
 *   toggleMenu:      () => void,
 *   closeMenu:       () => void,
 *   menuButtonRef:   React.RefObject<HTMLButtonElement>,
 *   mobileDrawerRef: React.RefObject<HTMLDivElement>,
 * }}
 */
export function useNavbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const location = useLocation();
  const menuButtonRef = useRef(null); // hamburger button — focus restored here on close
  const mobileDrawerRef = useRef(null); // drawer container — focus trapped within

  // ── Close menu on route change ─────────────────────────────────────────────
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // ── Scroll shadow ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Stable callbacks ───────────────────────────────────────────────────────

  const closeMenu = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  // ── Scroll lock — non-destructive, preserves prior body overflow ───────────
  useScrollLock(mobileOpen);

  // ── Focus trap — rAF-based entry focus, dynamic DOM-safe Tab cycling ───────
  useFocusTrap({
    containerRef: mobileDrawerRef,
    restoreFocusRef: menuButtonRef,
    active: mobileOpen,
    onEscape: closeMenu,
  });

  return {
    isScrolled,
    mobileOpen,
    toggleMenu,
    closeMenu,
    menuButtonRef,
    mobileDrawerRef,
  };
}
