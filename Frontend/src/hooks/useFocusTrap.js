/**
 * @file useFocusTrap.js
 * @module hooks
 *
 * Reusable, isolated focus trap hook.
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 *  • When `active` is true, traps Tab/Shift+Tab focus within `containerRef`
 *  • Moves focus to the first focusable element when trap activates
 *    (uses requestAnimationFrame — deterministic, paint-cycle-safe)
 *  • Closes trap and restores focus to `restoreFocusRef` on Escape key
 *  • Recalculates focusable nodes on every keydown — handles dynamic DOM
 *    mutations (disabled state changes, conditional rendering, portals)
 *
 * Extracted from useNavbar so it can be:
 *  • Reused by modals, drawers, tooltips, and any future dialog component
 *  • Unit-tested independently of navbar state (see Phase 5 tests)
 *  • Audited in isolation for WCAG 2.1.2 compliance
 *
 * WCAG Compliance:
 *  2.1.2 — No Keyboard Trap (focus must be trappable AND escapable)
 *  2.4.3 — Focus Order (focus restoration preserves logical order)
 *
 * @param {{
 *   containerRef:     React.RefObject<HTMLElement>,  — element to trap focus within
 *   restoreFocusRef:  React.RefObject<HTMLElement>,  — element to restore focus to on close
 *   active:           boolean,                       — trap is active when true
 *   onEscape?:        () => void,                    — called when Escape is pressed
 * }} options
 */

import { useEffect, useLayoutEffect } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Selector covering all natively focusable elements.
 * Excludes elements with negative tabindex (programmatic-only focus),
 * disabled form controls, and hidden elements.
 *
 * Evaluated fresh on each keydown so dynamic DOM mutations
 * (e.g. a button becoming disabled mid-interaction) are caught correctly.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]:not([disabled]):not([hidden])",
  "button:not([disabled]):not([hidden])",
  "input:not([disabled]):not([hidden])",
  "select:not([disabled]):not([hidden])",
  "textarea:not([disabled]):not([hidden])",
  '[tabindex]:not([tabindex="-1"]):not([disabled]):not([hidden])',
].join(", ");

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Returns first and last focusable elements within a container.
 * Filters out elements not currently visible in the layout
 * (offsetParent === null catches display:none subtrees).
 *
 * @param {HTMLElement | null} container
 * @returns {{ first: HTMLElement | null, last: HTMLElement | null }}
 */
function getFocusableEdges(container) {
  if (!container) return { first: null, last: null };

  const nodes = Array.from(
    container.querySelectorAll(FOCUSABLE_SELECTOR),
  ).filter(
    // Exclude elements hidden via display:none or visibility:hidden
    (el) => !el.closest("[hidden]") && el.offsetParent !== null,
  );

  return {
    first: nodes.at(0) ?? null,
    last: nodes.at(-1) ?? null,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {{
 *   containerRef:    React.RefObject<HTMLElement>,
 *   restoreFocusRef: React.RefObject<HTMLElement>,
 *   active:          boolean,
 *   onEscape?:       () => void,
 * }} options
 */
export function useFocusTrap({
  containerRef,
  restoreFocusRef,
  active,
  onEscape,
}) {
  // ── Move focus into container when trap activates ──────────────────────────
  //
  // useLayoutEffect fires synchronously after DOM mutations, before the browser
  // paints — guaranteeing the drawer is in the DOM before we query it.
  // requestAnimationFrame defers the actual .focus() call to the next paint
  // cycle, ensuring Framer Motion's entrance animation has started and the
  // element is both mounted AND composited before receiving focus.
  //
  // This replaces the fragile setTimeout(50) pattern: instead of guessing
  // an arbitrary delay, we hook into the browser's own render pipeline.
  //
  useLayoutEffect(() => {
    if (!active) return;

    let rafId;

    rafId = requestAnimationFrame(() => {
      const { first } = getFocusableEdges(containerRef.current);
      first?.focus();
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [active, containerRef]);

  // ── Keyboard handler: Tab cycling + Escape ─────────────────────────────────
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        // Call consumer's close handler, then restore focus
        onEscape?.();
        // Defer focus restoration to next tick — consumer's state update
        // (setMobileOpen(false)) must complete first so the button is
        // fully interactive before receiving focus
        requestAnimationFrame(() => {
          restoreFocusRef.current?.focus();
        });
        return;
      }

      if (e.key === "Tab") {
        // Recalculate on each keydown — handles dynamic DOM mutations:
        // a button becoming disabled, conditional renders, or async content
        const { first, last } = getFocusableEdges(containerRef.current);
        if (!first || !last) return;

        if (e.shiftKey) {
          // Shift+Tab: at first element → wrap to last
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab: at last element → wrap to first
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, containerRef, restoreFocusRef, onEscape]);
}
