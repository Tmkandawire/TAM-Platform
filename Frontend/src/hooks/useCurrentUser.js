import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import useAuthStore from "../store/authStore.js";
import authService from "../services/auth.service.js";
import { setCsrfToken } from "../services/api.js";

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

const AUTH_CHANNEL = "tam:auth:channel";

/**
 * @returns {{ isLoading: boolean, isError: boolean, isFetched: boolean }}
 */
export function useCurrentUser() {
  const { isHydrated, setUser, logout } = useAuthStore();

  const isRevalidating = useRef(false);

  const queryClient = useQueryClient();

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

  // Success — sync user into store
  useEffect(() => {
    if (!data) return;

    const user = data?.data ?? data;

    if (!user) return;

    if (user.csrfToken) setCsrfToken(user.csrfToken);

    setUser(user);

    // Only broadcast if this wasn't triggered by another tab
    if (!isRevalidating.current) {
      try {
        const ch = new BroadcastChannel(AUTH_CHANNEL);

        ch.postMessage({ type: "LOGIN" });

        ch.close();
      } catch (_) {}
    }

    isRevalidating.current = false;
  }, [data, setUser]);

  // Failure — only hard-logout on 401
  useEffect(() => {
    if (!isError) return;

    const status = error?.status ?? 0;

    if (status === 401) {
      logout();

      if (!isRevalidating.current) {
        try {
          const ch = new BroadcastChannel(AUTH_CHANNEL);

          ch.postMessage({ type: "LOGOUT" });

          ch.close();
        } catch (_) {}
      }
    }

    if (status !== 401) {
      useAuthStore.setState({ isVerified: true });
    }

    isRevalidating.current = false;
  }, [isError, error, logout]);

  // Listen for auth changes from other tabs
  useEffect(() => {
    let ch;

    try {
      ch = new BroadcastChannel(AUTH_CHANNEL);

      ch.onmessage = (e) => {
        if (e.data?.type === "LOGIN" || e.data?.type === "LOGOUT") {
          // Prevent rebroadcast loop
          isRevalidating.current = true;

          queryClient.invalidateQueries({
            queryKey: CURRENT_USER_QUERY_KEY,
          });
        }
      };
    } catch (_) {}

    return () => ch?.close();
  }, [queryClient]);

  return { isLoading, isError, isFetched };
}
