import { create } from "zustand";

/**
 * Global auth store — Zustand.
 *
 * Session lifecycle states
 * ─────────────────────────
 *
 *  isHydrated   isVerified   isAuthenticated   Meaning
 *  ──────────   ──────────   ───────────────   ───────────────────────────────
 *  false        false        false             App just mounted, /auth/me pending
 *  true         false        false             hydrate() called, /auth/me in-flight
 *  true         true         true              /auth/me succeeded — valid session
 *  true         true         false             /auth/me returned 401 — no session
 *
 * ProtectedRoute must show <PageLoader /> while !isVerified to avoid
 * redirecting a valid session to /login before /auth/me has resolved.
 *
 * Token strategy — cookie-only:
 *  The backend issues accessToken, refreshToken, and csrfToken as httpOnly
 *  cookies. No token ever touches localStorage or Zustand state. Axios sends
 *  cookies automatically via withCredentials: true. This store holds only
 *  the user object derived from a successful /auth/me response.
 */
const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,

  /**
   * isHydrated — true once hydrate() is called on app boot.
   * Signals that the app has initialised and useCurrentUser has been triggered.
   */
  isHydrated: false,

  /**
   * isVerified — true once /auth/me has resolved (success or 401).
   * ProtectedRoute waits for this before making any redirect decisions.
   * This prevents the back-button / refresh kick-to-login bug.
   */
  isVerified: false,

  /**
   * Called after a successful login response.
   */
  login: (user) => {
    set({ user, isAuthenticated: true, isVerified: true });
  },

  /**
   * Called on explicit logout or when the refresh token has expired.
   */
  logout: () => {
    set({ user: null, isAuthenticated: false, isVerified: true });
  },

  /**
   * Called by useCurrentUser once /auth/me resolves successfully.
   * Sets isAuthenticated: true and marks the session as verified.
   */
  setUser: (user) => set({ user, isAuthenticated: true, isVerified: true }),

  /**
   * Called once on app boot in App.jsx.
   * Marks the app as hydrated — does NOT set isAuthenticated or isVerified.
   * Both are set only after /auth/me resolves via setUser or logout.
   */
  hydrate: () => {
    set({ isHydrated: true });
  },
}));

export default useAuthStore;
