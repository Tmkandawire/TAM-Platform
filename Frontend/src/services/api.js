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
 *  - 401 → attempt one silent token refresh via POST /auth/refresh
 *  - Refresh failure → dispatch forced logout event → redirect to /login
 *  - Normalising backend error shapes to { message, code, errors, status }
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // Sends httpOnly cookies (accessToken, refreshToken, csrfToken)
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
  },
});

/* ─── Response interceptor ──────────────────────────────────────────────── */
api.interceptors.response.use(
  // Success — unwrap response.data so call sites receive the payload directly
  (response) => response.data,

  // Error — attempt silent refresh on 401, normalise all errors before rejecting
  async (error) => {
    const originalRequest = error.config;

    // 401 Unauthorized — access token expired or missing.
    // Attempt one silent refresh using the httpOnly refreshToken cookie.
    if (
      error.response?.status === 401 &&
      !originalRequest._retried &&
      // Guard against infinite loops on the refresh and login endpoints
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login")
    ) {
      originalRequest._retried = true;

      try {
        // POST /auth/refresh — the backend rotates both cookies in-place.
        // No token extraction needed: the new accessToken cookie is set
        // automatically by the Set-Cookie response header.
        await api.post("/auth/refresh");

        // Retry the original request — it will now send the new cookie
        return api(originalRequest);
      } catch {
        // Refresh failed (refresh token expired, revoked, or invalid).
        // Dispatch a custom event so App.jsx can call authStore.logout()
        // without a circular import between api.js and authStore.js.
        window.dispatchEvent(new CustomEvent("tam:auth:logout"));
        window.location.href = "/login";
      }
    }

    // Normalise the backend error shape for all call sites.
    // Backend errors follow ApiResponse structure: { success, message, code, errors }
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
