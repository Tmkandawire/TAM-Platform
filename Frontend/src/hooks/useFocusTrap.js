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

const FOCUSABLE_SELECTOR = [
  "a[href]:not([disabled]):not([hidden])",
  "button:not([disabled]):not([hidden])",
  "input:not([disabled]):not([hidden])",
  "select:not([disabled]):not([hidden])",
  "textarea:not([disabled]):not([hidden])",
  '[tabindex]:not([tabindex="-1"]):not([disabled]):not([hidden])',
].join(", ");

// ─── Utilities ────────────────────────────────────────────────────────────────

function getFocusableEdges(container) {
  if (!container) return { first: null, last: null };

  const nodes = Array.from(
    container.querySelectorAll(FOCUSABLE_SELECTOR),
  ).filter((el) => !el.closest("[hidden]") && el.offsetParent !== null);

  return {
    first: nodes.at(0) ?? null,
    last: nodes.at(-1) ?? null,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFocusTrap({
  containerRef,
  restoreFocusRef,
  active,
  onEscape,
}) {
  // ── Move focus into container when trap activates ──────────────────────────
  useLayoutEffect(() => {
    if (!active) return;

    const rafId = requestAnimationFrame(() => {
      const { first } = getFocusableEdges(containerRef.current);
      first?.focus();
    });

    return () => cancelAnimationFrame(rafId);
  }, [active, containerRef]);

  // ── Keyboard handler: Tab cycling + Escape ─────────────────────────────────
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onEscape?.();
        requestAnimationFrame(() => {
          restoreFocusRef?.current?.focus();
        });
        return;
      }

      if (e.key === "Tab") {
        const { first, last } = getFocusableEdges(containerRef.current);
        if (!first || !last) return;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
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
