/**
 * @file pages/auth/PendingPage.jsx
 * @module pages/auth
 *
 * Shown after onboarding completes and while the member's application
 * is awaiting admin review.
 *
 * Behaviour:
 *  - Polls GET /auth/me every 30 seconds
 *  - When user.status changes to "active", auto-redirects to the member dashboard
 *  - Provides a logout button so the user isn't trapped
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Clock, CheckCircle2, FileText, Mail, LogOut } from "lucide-react";
import useAuthStore from "../../store/authStore.js";
import { useAuth } from "../../hooks/useAuth.js";
import { CURRENT_USER_QUERY_KEY } from "../../hooks/useCurrentUser.js";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export default function PendingPage() {
  const { user } = useAuthStore();
  const { logoutMutation } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Poll /auth/me until status is "active" ────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      // Invalidate the /auth/me cache — useCurrentUser in App.jsx will
      // refetch automatically and update the store via setUser().
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_QUERY_KEY });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [queryClient]);

  // ── Redirect when approved ────────────────────────────────────────────────
  useEffect(() => {
    if (user?.status === "active") {
      navigate("/member/dashboard", { replace: true });
    }
  }, [user?.status, navigate]);

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        {/* ── Card ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {/* Header band */}
          <div className="bg-amber-50 border-b border-amber-100 px-8 py-6 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 mb-4">
              <Clock className="w-7 h-7 text-amber-600" aria-hidden="true" />
            </div>
            <h1 className="font-display font-bold text-gray-900 text-xl">
              Application Under Review
            </h1>
            <p className="font-body text-sm text-amber-700 mt-1">
              Your TAM membership application has been submitted
            </p>
          </div>

          {/* Body */}
          <div className="px-8 py-6 space-y-5">
            <p className="font-body text-sm text-gray-600 leading-relaxed text-center">
              The TAM secretariat is reviewing your profile and documents. This
              typically takes <strong>1–3 business days</strong>. You will
              receive an email notification once a decision is made.
            </p>

            {/* What happens next */}
            <div className="space-y-3">
              <p className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider">
                What happens next
              </p>

              {[
                {
                  icon: FileText,
                  title: "Documents reviewed",
                  desc: "The secretariat verifies your business and KYC documents",
                },
                {
                  icon: CheckCircle2,
                  title: "Account activated",
                  desc: "Once approved, you get full access to the member portal",
                },
                {
                  icon: Mail,
                  title: "Email notification",
                  desc: "You'll receive an email when your application is decided",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon
                      className="w-3.5 h-3.5 text-gray-500"
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <p className="font-body text-sm font-semibold text-gray-800">
                      {title}
                    </p>
                    <p className="font-body text-xs text-gray-500 mt-0.5">
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Logged in as */}
            {user?.email && (
              <div className="px-4 py-3 rounded-lg bg-gray-50 border border-gray-100">
                <p className="font-body text-xs text-gray-500 text-center">
                  Logged in as{" "}
                  <span className="font-semibold text-gray-700">
                    {user.email}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-4 border-t border-gray-50 bg-gray-50/30">
            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                font-body text-sm font-medium text-gray-500 hover:text-gray-700
                hover:bg-gray-100 transition-colors duration-150
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-gray-400 focus-visible:ring-offset-2
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              {logoutMutation.isPending ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>

        <p className="font-body text-xs text-gray-400 text-center mt-4">
          This page checks for updates automatically every 30 seconds.
        </p>
      </motion.div>
    </div>
  );
}
