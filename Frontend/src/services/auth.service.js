import api from "./api.js";

/**
 * Auth service — all calls to /auth/* endpoints.
 *
 * The Axios interceptor in api.js unwraps response.data on success,
 * so every function here returns the full ApiResponse envelope:
 * { success, statusCode, data, message, timestamp }
 *
 * Call sites extract the payload from .data — e.g. data?.data ?? data.
 */
const authService = {
  /**
   * Register a new member account.
   * @param {{ email: string, password: string }} credentials
   */
  register: (credentials) => api.post("/auth/register", credentials),

  /**
   * Log in with email and password.
   * Sets accessToken, refreshToken, and csrfToken as httpOnly cookies.
   * Returns ApiResponse with the user object in data.data.
   * @param {{ email: string, password: string }} credentials
   */
  login: (credentials) => api.post("/auth/login", credentials),

  /**
   * Fetch the currently authenticated user.
   * Requires a valid accessToken cookie — called on app boot to
   * rehydrate the user object after a page reload.
   * Returns ApiResponse with the user object in data.data.
   */
  me: () => api.get("/auth/me"),

  /**
   * Silently refresh the access token using the httpOnly refresh cookie.
   * The new accessToken is set as a cookie — no return value needed.
   */
  refresh: () => api.post("/auth/refresh"),

  /**
   * Log out — instructs the backend to clear all auth cookies.
   */
  logout: () => api.post("/auth/logout"),

  /**
   * Submit the onboarding form — creates the member profile and uploads
   * KYC documents in a single request.
   *
   * Expects a FormData object containing:
   *  - Profile fields: businessName, registrationNumber, taxId,
   *    membershipType, contactPerson, phoneNumber, physicalAddress,
   *    city, fleetSize, vehicleTypes[]
   *  - Document files: nationalId, businessCert, and optionally
   *    tinCertificate, utilityBill, passport
   *
   * Content-Type is left unset so Axios sets multipart/form-data with
   * the correct boundary automatically.
   *
   * @param {FormData} formData
   */
  completeOnboarding: (formData) =>
    api.post("/auth/onboarding/complete", formData),
};

export default authService;
