/**
 * @file useScrollLock.js
 * @module hooks
 *
 * Isolated, non-destructive body scroll lock hook.
 *
 * Problem with the naive implementation:
 *   document.body.style.overflow = "hidden"  // lock
 *   document.body.style.overflow = ""        // unlock ← WRONG
 *
 *   If another component (a modal, a toast, another drawer) set overflow
 *   before this lock activates, restoring to "" destroys their state.
 *   This becomes a production bug the moment a second overlay exists.
 *
 * This implementation:
 *   1. Reads and preserves the current overflow value before locking
 *   2. Restores exactly that value on cleanup — never assumes ""
 *   3. Compensates for scrollbar width to prevent layout shift
 *      (common cause of "page jumps" when a modal opens)
 *   4. Is safe to call from multiple components simultaneously because
 *      each instance manages its own captured value
 *
 * Reusability:
 *   Extracted from useNavbar so any modal, sheet, or dialog component
 *   can use this directly without duplicating the pattern.
 *
 * @param {boolean} locked — lock is active when true
 */

import { useLayoutEffect } from "react";

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useScrollLock(locked) {
  useLayoutEffect(() => {
    if (!locked) return;

    const body = document.body;

    // ── Capture current state ──────────────────────────────────────────────
    const previousOverflow = body.style.overflow ?? "";
    const previousPaddingRight = body.style.paddingRight ?? "";

    // ── Compensate for scrollbar width to prevent layout shift ─────────────
    // The scrollbar disappears when overflow:hidden is applied — adding
    // equivalent padding-right prevents the content from shifting right.
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    // ── Apply lock ─────────────────────────────────────────────────────────
    body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // ── Cleanup: restore exactly what was there before ─────────────────────
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [locked]);
}
