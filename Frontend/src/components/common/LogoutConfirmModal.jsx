/**
 * @file LogoutConfirmModal.jsx
 * @module components/common
 *
 * Reusable logout confirmation dialog.
 * Renders via a React Portal into document.body so it is never clipped
 * by a parent with overflow-hidden (e.g. the sidebar).
 */

import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, X } from "lucide-react";
import { cn } from "../../utils/cn.js";

export default function LogoutConfirmModal({
  open,
  onConfirm,
  onCancel,
  isLoading,
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-gray-900/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!isLoading ? onCancel : undefined}
          />

          {/* Dialog */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
            }}
            exit={{
              opacity: 0,
              scale: 0.95,
              y: 8,
              transition: { duration: 0.15 },
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <LogOut
                    className="w-4 h-4 text-primary-500"
                    aria-hidden="true"
                  />
                </div>
                <h2
                  id="logout-title"
                  className="font-display font-bold text-gray-900 text-base"
                >
                  Sign out?
                </h2>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center",
                  "text-gray-400 hover:text-gray-600 hover:bg-gray-100",
                  "transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
                  isLoading && "opacity-50 cursor-not-allowed",
                )}
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 pb-5">
              <p className="font-body text-sm text-gray-500 leading-relaxed">
                Are you sure you want to sign out?
              </p>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-5">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isLoading}
                  className={cn(
                    "flex-1 px-4 py-2.5 rounded-xl border border-gray-200",
                    "font-body text-sm font-medium text-gray-700",
                    "hover:bg-gray-50 transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
                    isLoading && "opacity-50 cursor-not-allowed",
                  )}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={isLoading}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl",
                    "bg-primary-500 text-white font-body text-sm font-medium",
                    "hover:bg-primary-600 transition-colors duration-150 shadow-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
                    isLoading && "opacity-70 cursor-wait",
                  )}
                >
                  {isLoading ? (
                    <>
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                      Signing out…
                    </>
                  ) : (
                    <>
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
