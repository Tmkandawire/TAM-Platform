/**
 * @file ProtectedRoute.jsx
 * @module components/common
 *
 * Route guard for authenticated and role-restricted pages.
 *
 * Handles three distinct states before rendering children:
 *  1. Hydrating  — auth store is reading localStorage, show loader
 *  2. Unauthenticated — no valid session, redirect to /login
 *  3. Wrong role — authenticated but insufficient permissions, redirect to
 *                  their correct dashboard rather than a generic 403 page
 *
 * Usage in router:
 *
 *   // Any authenticated user
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/member/dashboard" element={<DashboardPage />} />
 *   </Route>
 *
 *   // Role-restricted
 *   <Route element={<ProtectedRoute requiredRole="admin" />}>
 *     <Route path="/admin/dashboard" element={<AdminDashboard />} />
 *   </Route>
 *
 *   // With custom redirect on auth failure
 *   <Route element={<ProtectedRoute redirectTo="/login?reason=session_expired" />}>
 *     ...
 *   </Route>
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import useAuthStore from "../../store/authStore.js";
import PageLoader from "./PageLoader.jsx";

/**
 * Role → home route map.
 * Used to redirect users who land on a route their role cannot access,
 * sending them to their own dashboard rather than a generic error page.
 *
 * Keep this in sync with the role constants in:
 *   Backend/src/constants/roles.js
 */
const ROLE_HOME = {
  admin: "/admin/dashboard",
  member: "/member/dashboard",
};

/**
 * @param {{
 *   requiredRole?: "admin" | "member",
 *   redirectTo?:  string,
 * }} props
 *
 * requiredRole — if provided, the user's role must match exactly.
 *                If omitted, any authenticated user is allowed through.
 *
 * redirectTo   — where to send unauthenticated users.
 *                Defaults to "/login" with the full attempted path (pathname
 *                + search + hash) preserved as router state under `from` so
 *                LoginPage can redirect back to exactly where the user was.
 */
export default function ProtectedRoute({ requiredRole, redirectTo }) {
  const { isHydrated, isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  // ── 1. Still hydrating ───────────────────────────────────────────────────
  // Auth store is reading localStorage. Rendering nothing yet avoids a
  // flash where the guard incorrectly treats a valid session as logged-out.
  if (!isHydrated) {
    return <PageLoader />;
  }

  // ── 2. Not authenticated ─────────────────────────────────────────────────
  // Preserve the attempted URL in state so LoginPage can redirect back
  // after a successful login (e.g. user bookmarked /member/documents).
  if (!isAuthenticated) {
    const destination = redirectTo ?? "/login";
    // Preserve the full URL — pathname + query string + hash — so LoginPage
    // can redirect back to exactly where the user was, not just the base path.
    // e.g. /member/documents?tab=pending#upload is fully restored after login.
    const fullPath = location.pathname + location.search + location.hash;
    return <Navigate to={destination} state={{ from: fullPath }} replace />;
  }

  // ── 3. Authenticated but wrong role ──────────────────────────────────────
  // Send them to their own dashboard. Avoids a confusing blank page or
  // generic 403 — a member hitting /admin/* goes to /member/dashboard,
  // an admin hitting /member/* goes to /admin/dashboard.
  if (requiredRole && user?.role !== requiredRole) {
    const home = ROLE_HOME[user?.role] ?? "/login";
    return <Navigate to={home} replace />;
  }

  // ── 4. Authorised ────────────────────────────────────────────────────────
  return <Outlet />;
}
