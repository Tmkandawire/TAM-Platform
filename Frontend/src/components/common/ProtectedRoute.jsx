/**
 * @file ProtectedRoute.jsx
 * @module components/common
 *
 * Route guard for authenticated and role-restricted pages.
 *
 * Handles five distinct states before rendering children:
 *  1. Unverified    — /auth/me hasn't resolved yet, show loader.
 *  2. Unauthenticated — /auth/me resolved with 401, redirect to /login.
 *  3. Pending       — authenticated but status is "pending" (onboarding
 *                     incomplete or awaiting admin approval). Redirect to
 *                     the appropriate route based on requireActive flag:
 *                       requireActive=true  → /pending
 *                       requireActive=false → allow through (onboarding
 *                       itself needs this to render for pending users)
 *  4. Wrong role    — authenticated but insufficient permissions, redirect
 *                     to their correct dashboard.
 *  5. Authorised    — render children via <Outlet />.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import useAuthStore from "../../store/authStore.js";
import PageLoader from "./PageLoader.jsx";

const ROLE_HOME = {
  admin: "/admin/dashboard",
  member: "/member/dashboard",
};

/**
 * @param {{
 *   requiredRole?:  "admin" | "member",
 *   redirectTo?:   string,
 *   requireActive?: boolean,
 * }} props
 *
 * requireActive (default: true)
 *   true  — pending/inactive users are redirected to /pending.
 *            Use on all member portal routes (/member/*).
 *   false — pending users are allowed through.
 *            Use on /onboarding so pending users can complete their profile.
 */
export default function ProtectedRoute({
  requiredRole,
  redirectTo,
  requireActive = true,
}) {
  const { isVerified, isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  // ── 1. Session not yet verified ──────────────────────────────────────────
  // /auth/me is still in-flight. Show loader — do NOT redirect.
  if (!isVerified) {
    return <PageLoader />;
  }

  // ── 2. Not authenticated ─────────────────────────────────────────────────
  if (!isAuthenticated) {
    const destination = redirectTo ?? "/login";
    const fullPath = location.pathname + location.search + location.hash;
    return <Navigate to={destination} state={{ from: fullPath }} replace />;
  }

  // ── 3. Authenticated but account not active ──────────────────────────────
  // Pending users have valid credentials but haven't been approved yet.
  // requireActive=true (default) — redirect to /pending so they see the
  // waiting screen rather than a broken portal.
  // requireActive=false — allow through (used on /onboarding itself).
  if (requireActive && user?.status !== "active") {
    // If they haven't completed onboarding yet (no profile submitted),
    // send them to /onboarding. If they have submitted and are awaiting
    // admin review, send them to /pending.
    // The distinction is made by checking status — both "pending" users
    // who haven't submitted yet and those waiting for review have the same
    // status at this point. /pending handles both cases with appropriate
    // messaging by checking if documents exist.
    return <Navigate to="/pending" replace />;
  }

  // ── 4. Authenticated but wrong role ──────────────────────────────────────
  if (requiredRole && user?.role !== requiredRole) {
    const home = ROLE_HOME[user?.role] ?? "/login";
    return <Navigate to={home} replace />;
  }

  // ── 5. Authorised ────────────────────────────────────────────────────────
  return <Outlet />;
}
