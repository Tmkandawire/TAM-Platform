import { useEffect } from "react";
import useAuthStore from "./store/authStore.js";
import { useCurrentUser } from "./hooks/useCurrentUser.js";
import AppRouter from "./router/index.jsx";

/**
 * Root app component.
 *
 * Responsibilities:
 *  - Hydrate auth store on mount (marks isHydrated: true)
 *  - Fetch /auth/me to populate the user object if a session cookie exists
 *  - Listen for forced logout events dispatched by the Axios 401 interceptor
 *  - Render the router
 */
export default function App() {
  const { hydrate, logout } = useAuthStore();

  useEffect(() => {
    // Mark the store as hydrated so ProtectedRoute stops showing PageLoader.
    // With cookie-only auth there is nothing to read from localStorage —
    // useCurrentUser fires immediately after and confirms or denies the session.
    hydrate();

    // The Axios interceptor dispatches this event when a silent token refresh
    // fails — avoids a circular import between api.js and authStore.js.
    const handleForcedLogout = () => logout();
    window.addEventListener("tam:auth:logout", handleForcedLogout);
    return () =>
      window.removeEventListener("tam:auth:logout", handleForcedLogout);
  }, [hydrate, logout]);

  /**
   * Fetches GET /auth/me on mount and syncs the user object into Zustand.
   * Only fires when isAuthenticated is true (i.e. after hydrate() runs).
   * On failure, clears auth state and lets ProtectedRoute redirect to /login.
   */
  useCurrentUser();

  return <AppRouter />;
}
