import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import useAuthStore from "../store/authStore.js";
import authService from "../services/auth.service.js";

/**
 * Role → default home route.
 * Used when there is no `from` state to return to after login.
 * Keep in sync with ProtectedRoute.jsx ROLE_HOME and backend roles.js.
 */
const ROLE_HOME = {
  admin: "/admin/dashboard",
  member: "/member/dashboard",
};

/**
 * useAuth — convenience hook for auth actions.
 *
 * Token strategy — cookie-only:
 *  The backend sets auth cookies on login. This hook never handles tokens
 *  directly — it only stores the user object returned in the response body.
 */
export function useAuth() {
  const { user, isAuthenticated, login, logout: storeLogout } = useAuthStore();

  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  /* ── Login ────────────────────────────────────────────────────────── */
  const loginMutation = useMutation({
    mutationFn: authService.login,
    onSuccess: (data) => {
      /**
       * Backend login response body: { success, message, data: user }
       * The Axios interceptor unwraps response.data, so `data` here is the
       * full ApiResponse object. Extract the user from data.data, with a
       * fallback to data directly in case the shape differs.
       *
       * Cookie strategy: accessToken, refreshToken, csrfToken are all set
       * as httpOnly cookies by the backend — no token handling needed here.
       */
      const userData = data?.data ?? data;
      login(userData);

      toast.success(`Welcome back, ${userData.email}`);

      /**
       * Redirect priority:
       *  1. `from` — the full URL the user was trying to reach before being
       *              sent to /login (set by ProtectedRoute, includes
       *              pathname + search + hash).
       *  2. Role home — their default dashboard if no prior destination.
       *  3. "/" — absolute fallback.
       */
      const destination =
        location.state?.from ?? ROLE_HOME[userData.role] ?? "/";

      navigate(destination, { replace: true });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  /* ── Register ─────────────────────────────────────────────────────── */
  const registerMutation = useMutation({
    mutationFn: authService.register,
    onSuccess: () => {
      toast.success(
        "Account created! Your application is pending review. You will be notified once approved.",
        { duration: 6000 },
      );
      navigate("/login", { replace: true });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  /* ── Logout ───────────────────────────────────────────────────────── */
  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSettled: () => {
      // Always clear client state regardless of server response.
      // Backend clears the cookies — frontend clears the store and cache.
      storeLogout();
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  return {
    user,
    isAuthenticated,
    role: user?.role ?? null,
    accountStatus: user?.status ?? null,

    // Actions
    loginMutation,
    registerMutation,
    logoutMutation,

    // Shorthand booleans
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
  };
}
