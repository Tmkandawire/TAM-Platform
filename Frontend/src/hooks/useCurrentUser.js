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
 * On page reload, authStore.hydrate() sets isAuthenticated: true optimistically
 * (the httpOnly cookie may still be valid) but user is null — the store has
 * no way to reconstruct the user object from a cookie it cannot read.
 *
 * This hook fires a /auth/me request on mount to confirm the session and
 * populate the user object. If the cookie has expired, the backend returns
 * 401, the Axios interceptor attempts a silent refresh, and on failure
 * dispatches "tam:auth:logout" which App.jsx catches and calls storeLogout().
 *
 * Where to call it
 * ─────────────────
 * Call once at the top of the component tree — inside a component that is
 * always mounted while the user could be authenticated. App.jsx is the
 * correct location:
 *
 *   export default function App() {
 *     useCurrentUser();
 *     ...
 *   }
 *
 * Do NOT call it inside ProtectedRoute or individual pages — it should run
 * once globally, not once per route render.
 *
 * What it returns
 * ────────────────
 * The hook populates the Zustand store as a side effect. Components that
 * need the user object should read from useAuthStore() or useAuth() —
 * not from this hook's return value directly. The return value is exposed
 * only for cases where the loading/error state is needed (e.g. a top-level
 * splash screen).
 */

/**
 * React Query cache key for the current user.
 * Exported so other queries can use it as a dependency key
 * (e.g. invalidate after profile update).
 *
 * @type {string[]}
 */
export const CURRENT_USER_QUERY_KEY = ["auth", "me"];

/**
 * @returns {{
 *   isLoading: boolean,
 *   isError:   boolean,
 *   isFetched: boolean,
 * }}
 */
export function useCurrentUser() {
  const { isAuthenticated, setUser, logout } = useAuthStore();

  const { data, isLoading, isError, isFetched, error } = useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,

    queryFn: authService.me,

    /**
     * Only run when the store believes the user is authenticated.
     * Prevents an unnecessary /auth/me call on the public pages before
     * the user has logged in.
     */
    enabled: isAuthenticated,

    /**
     * Do not retry on failure.
     * A failed /auth/me almost always means the session is genuinely
     * invalid — retrying delays the logout redirect and wastes requests.
     * The Axios interceptor already handles one silent refresh attempt
     * before this error reaches React Query.
     */
    retry: false,

    /**
     * Re-fetch when the user returns to the tab — catches sessions that
     * expired while the browser was in the background.
     */
    refetchOnWindowFocus: true,

    /**
     * Do not re-fetch on component remount — the session hasn't changed
     * between route navigations. Only the window focus refetch is needed.
     */
    refetchOnMount: false,

    /**
     * Cache the user data for 5 minutes.
     * Short enough to catch server-side changes (e.g. admin deactivating
     * an account) without hammering /auth/me on every navigation.
     */
    staleTime: 5 * 60 * 1000,
  });

  /**
   * Sync the query result into Zustand.
   *
   * Using useEffect rather than onSuccess (deprecated in React Query v5)
   * to keep the side effect explicit and co-located with the hook's purpose.
   */
  useEffect(() => {
    if (!data) return;

    /**
     * ApiResponse envelope shape from the backend:
     * { success, statusCode, data: user, message, timestamp }
     *
     * The Axios interceptor unwraps response.data, so `data` here is the
     * full ApiResponse object. The user lives at data.data.
     */
    const user = data?.data ?? data;

    if (user) {
      setUser(user);
    }
  }, [data, setUser]);

  /**
   * Log out only on definitive auth failure — not on infrastructure errors.
   *
   * Error status distinctions:
   *  401 → session is genuinely invalid (interceptor's silent refresh also
   *        failed) → logout and redirect to /login.
   *  5xx → server or gateway error → leave the session intact. The user's
   *        cookie is still valid; the server is temporarily unavailable.
   *        React Query's error state surfaces this without destroying a
   *        valid session.
   *  Network error (status 0) → connectivity issue → same as 5xx, do not
   *        logout. User may be on a flaky connection.
   *
   * The Axios interceptor already handles 401 → dispatch → redirect, so
   * this effect is a safety net for edge cases where the interceptor does
   * not fire (e.g. request cancelled before response, _retried not set).
   */
  useEffect(() => {
    if (!isError) return;
    const status = error?.status ?? 0;
    if (status === 401) {
      logout();
    }
    // 5xx, network errors (status 0), other 4xx — leave session intact
  }, [isError, error, logout]);

  return { isLoading, isError, isFetched };
}
