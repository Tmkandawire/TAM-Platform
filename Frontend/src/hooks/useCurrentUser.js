import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import useAuthStore from "../store/authStore.js";
import authService from "../services/auth.service.js";

/**
 * @file useCurrentUser.js
 * @module hooks
 *
 * Fetches and maintains the authenticated user object from GET /auth/me.
 *
 * Why this hook exists
 * ─────────────────────
 * On page reload, authStore.hydrate() marks the app as ready (isHydrated: true)
 * but user is null and isVerified is false. This hook fires /auth/me to
 * confirm the session and either:
 *   a) Calls setUser(user) → isAuthenticated: true, isVerified: true
 *   b) Calls logout()      → isAuthenticated: false, isVerified: true
 *
 * ProtectedRoute waits for isVerified before making redirect decisions,
 * which prevents the back-button / refresh kick-to-login bug where a valid
 * session was treated as unauthenticated during the /auth/me in-flight window.
 *
 * Where to call it
 * ─────────────────
 * Call once in App.jsx — not inside ProtectedRoute or individual pages.
 */

export const CURRENT_USER_QUERY_KEY = ["auth", "me"];

/**
 * @returns {{ isLoading: boolean, isError: boolean, isFetched: boolean }}
 */
export function useCurrentUser() {
  const { isHydrated, setUser, logout } = useAuthStore();

  const { data, isLoading, isError, isFetched, error } = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: authService.me,

    // Run as soon as the app has hydrated. Do not gate on isAuthenticated —
    // that would deadlock since isAuthenticated starts false and is only set
    // to true after this query succeeds.
    enabled: isHydrated,

    retry: false,
    refetchOnWindowFocus: true,
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000,
  });

  // Success — sync user into store, marks isVerified: true
  useEffect(() => {
    if (!data) return;
    const user = data?.data ?? data;
    if (user) setUser(user);
  }, [data, setUser]);

  // Failure — only hard-logout on 401; leave session intact for 5xx / network errors.
  // logout() also sets isVerified: true so ProtectedRoute stops showing the loader
  // and redirects to /login.
  useEffect(() => {
    if (!isError) return;
    const status = error?.status ?? 0;
    if (status === 401) {
      logout();
    }
    // 5xx / network (status 0) — server temporarily unavailable, cookie still valid.
    // We must still mark isVerified so ProtectedRoute doesn't spin forever.
    // Keep isAuthenticated as-is (false on fresh load, true if previously set).
    // The user will see a loader briefly then be redirected if truly unauthenticated.
    if (status !== 401) {
      // Mark verified without changing authentication state so ProtectedRoute
      // can make a decision based on the current isAuthenticated value.
      useAuthStore.setState({ isVerified: true });
    }
  }, [isError, error, logout]);

  return { isLoading, isError, isFetched };
}
