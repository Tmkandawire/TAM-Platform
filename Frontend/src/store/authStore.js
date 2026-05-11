import { create } from "zustand";

/**
 * Global auth store — Zustand.
 *
 * Responsibilities:
 *  - Hold the current authenticated user object
 *  - Expose login / logout / setUser actions
 *  - Mark hydration complete so ProtectedRoute knows when to trust state
 *
 * Token strategy — cookie-only:
 *  The backend issues accessToken, refreshToken, and csrfToken as httpOnly
 *  cookies. No token ever touches localStorage or Zustand state. Axios sends
 *  cookies automatically via withCredentials: true. This store holds only
 *  the user object derived from a successful /auth/me response.
 *
 * Server state (profile data, documents) lives in React Query, NOT here.
 * This store only holds the authentication session identity.
 */
const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,

  /**
   * isHydrated — false until hydrate() is called on app boot.
   * ProtectedRoute renders <PageLoader /> while this is false to prevent
   * a flash redirect to /login before we know the session state.
   */
  isHydrated: false,

  /**
   * Called after a successful login response.
   * The accessToken cookie is set by the backend — no token handling needed here.
   *
   * @param {object} user - User object returned in the login response body
   */
  login: (user) => {
    set({ user, isAuthenticated: true });
  },

  /**
   * Called on explicit logout or when the refresh token has expired.
   * Clears all auth state — the backend clears the cookies server-side.
   */
  logout: () => {
    set({ user: null, isAuthenticated: false });
  },

  /**
   * Updates the user object in the store.
   * Used when profile data changes (e.g. after admin activates an account
   * and the app re-fetches /auth/me to reflect the new status).
   *
   * @param {object} user - Updated user object
   */
  setUser: (user) => set({ user }),

  /**
   * Called once on app boot in App.jsx.
   *
   * Cookie-only strategy means there is nothing to read from localStorage.
   * We mark the app as hydrated and set isAuthenticated optimistically —
   * the /auth/me query (useCurrentUser) fires immediately after and either:
   *   a) Confirms the session → populates user via setUser
   *   b) Gets a 401 → triggers logout and clears isAuthenticated
   *
   * ProtectedRoute waits for isHydrated before making any redirect decisions.
   */
  hydrate: () => {
    set({ isHydrated: true, isAuthenticated: true });
  },
}));

export default useAuthStore;
