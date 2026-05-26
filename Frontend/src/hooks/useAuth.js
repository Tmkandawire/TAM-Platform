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
 *  The backend sets auth cookies on login and registration. This hook
 *  never handles tokens directly — it only stores the user object
 *  returned in the response body.
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
      const userData = data?.data ?? data;
      login(userData);

      toast.success(`Welcome back, ${userData.email}`);

      /**
       * Redirect priority:
       *  1. `from` — the full URL the user was trying to reach before being
       *              sent to /login (set by ProtectedRoute).
       *  2. Role home — their default dashboard if no prior destination.
       *  3. "/" — absolute fallback.
       */
      const destination =
        location.state?.from ?? ROLE_HOME[userData.role] ?? "/";

      navigate(destination, { replace: true });
    },
    onError: (error) => {
      // ACCOUNT_INACTIVE means the user registered but never completed
      // onboarding, or their account is pending. Route them to onboarding
      // so they can finish rather than showing a dead-end error.
      if (error.code === "ACCOUNT_INACTIVE") {
        toast.info("Please complete your profile to continue.");
        navigate("/onboarding", { replace: true });
        return;
      }

      toast.error(error.message);
    },
  });

  /* ── Register ─────────────────────────────────────────────────────── */
  const registerMutation = useMutation({
    mutationFn: authService.register,
    onSuccess: (data) => {
      // Backend now creates a session on registration and returns the user
      // object with auth cookies. Populate the store so ProtectedRoute
      // knows the user is authenticated before /auth/me resolves.
      const userData = data?.data ?? data;
      login(userData);

      toast.success("Account created! Let's set up your profile.");

      // Redirect to onboarding — user is already authenticated (cookies set).
      // No login step needed.
      navigate("/onboarding", { replace: true });
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
