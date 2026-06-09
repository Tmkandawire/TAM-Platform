import axios from "axios";
import { resolveErrorMessage } from "../utils/errorMessages.js";

/**
 * Central Axios instance for all TAM API calls.
 *
 * Token strategy — cookie-only:
 *  The backend issues accessToken, refreshToken, and csrfToken as httpOnly
 *  cookies. withCredentials: true ensures cookies are sent automatically on
 *  every request — no manual Authorization header needed.
 *
 * Interceptors handle:
 *  - CSRF  → reads csrfToken cookie and sets X-CSRF-Token header on every
 *            mutating request (POST, PUT, PATCH, DELETE)
 *  - 401   → attempt one silent token refresh via POST /auth/refresh
 *  - Refresh failure → dispatch forced logout event → redirect to /login
 *  - Normalising backend error shapes to { message, code, errors, status }
 *
 * FIX (2026-05-16): Added isRedirectingToLogin guard to prevent the
 * infinite reload loop after logout:
 *
 *   logout → /auth/me 401 → interceptor tries refresh → refresh fails
 *   → window.location.href = "/login" → page reloads → /auth/me fires
 *   → 401 → refresh → fails → redirect → infinite loop
 *
 * The guard ensures only ONE redirect to /login can fire per page lifecycle.
 * Once set, all subsequent 401 flows short-circuit before touching
 * window.location, stopping the cascade immediately.
 */

/**
 * Module-level redirect guard.
 * Prevents multiple simultaneous redirects to /login when the token
 * refresh fails. Reset naturally on every page load (module re-evaluated).
 */
let isRedirectingToLogin = false;

/**
 * In-memory CSRF token store.
 * Populated after login/register/refresh responses.
 */
let _csrfToken = null;

export const setCsrfToken = (token) => {
  _csrfToken = token;
};

export const getCsrfToken = () => _csrfToken;

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  timeout: 60_000,
});

/* ─── Request interceptor — attach CSRF token ───────────────────────────── */
api.interceptors.request.use((config) => {
  const MUTATING_METHODS = ["post", "put", "patch", "delete"];

  if (MUTATING_METHODS.includes(config.method?.toLowerCase())) {
    if (_csrfToken) {
      config.headers["X-CSRF-Token"] = _csrfToken;
    }
  }

  return config;
});

/* ─── Response interceptor ──────────────────────────────────────────────── */
api.interceptors.response.use(
  // Success — unwrap response.data so call sites receive the payload directly
  (response) => response.data,

  // Error — attempt silent refresh on 401, normalise all errors before rejecting
  async (error) => {
    const originalRequest = error.config;

    // 401 Unauthorized — access token expired or missing.
    if (
      error.response?.status === 401 &&
      !originalRequest._retried &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login")
    ) {
      // If we're already redirecting, don't attempt another refresh or redirect.
      // This is the fix for the infinite reload loop.
      if (isRedirectingToLogin) {
        return Promise.reject(error);
      }

      originalRequest._retried = true;

      try {
        const refreshResponse = await api.post("/auth/refresh");

        const newToken =
          refreshResponse?.data?.csrfToken ?? refreshResponse?.csrfToken;

        if (newToken) {
          setCsrfToken(newToken);
        }

        isRedirectingToLogin = false;

        return api(originalRequest);
      } catch {
        // Refresh failed — redirect once, never again this page lifecycle.
        if (!isRedirectingToLogin) {
          isRedirectingToLogin = true;
          window.dispatchEvent(new CustomEvent("tam:auth:logout"));
        }
      }
    }

    // Normalise the backend error shape for all call sites.
    const normalised = {
      message: resolveErrorMessage(error),
      code: error.response?.data?.code ?? "INTERNAL_ERROR",
      errors: error.response?.data?.errors ?? [],
      status: error.response?.status ?? 0,
    };

    return Promise.reject(normalised);
  },
);

export default api;
