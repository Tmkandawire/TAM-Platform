/**
 * @file MemberLayout.jsx
 * @module components/layout
 *
 * Authenticated member portal layout shell.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard,
  User,
  FileText,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Truck,
  Shield,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import notificationService, {
  NOTIFICATION_QUERY_KEYS,
} from "../../services/notification.service.js";
import useAuthStore from "../../store/authStore.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
import { cn } from "../../utils/cn.js";
import LogoutConfirmModal from "../common/LogoutConfirmModal.jsx";

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    label: "Dashboard",
    path: "/member/dashboard",
    icon: LayoutDashboard,
    end: true,
  },
  {
    label: "Profile",
    path: "/member/profile",
    icon: User,
    end: false,
  },
  {
    label: "Documents",
    path: "/member/documents",
    icon: FileText,
    end: false,
  },
  {
    label: "Notifications",
    path: "/member/notifications",
    icon: Bell,
    end: false,
  },
  {
    label: "Settings",
    path: "/member/settings",
    icon: Settings,
    end: false,
  },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: {
    label: "Pending Review",
    dot: "bg-amber-400",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
  },
  active: {
    label: "Active Member",
    dot: "bg-secondary-400",
    badge: "bg-secondary-50 text-secondary-700 border-secondary-200",
  },
  rejected: {
    label: "Application Rejected",
    dot: "bg-primary-400",
    badge: "bg-primary-50 text-primary-700 border-primary-200",
  },
  suspended: {
    label: "Suspended",
    dot: "bg-gray-400",
    badge: "bg-gray-50 text-gray-600 border-gray-200",
  },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-body font-medium",
        config.badge,
      )}
    >
      <span
        className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", config.dot)}
      />
      {config.label}
    </div>
  );
}

// ─── Sidebar nav link ─────────────────────────────────────────────────────────

function SidebarNavLink({ item, onClick }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onClick}
      aria-label={item.label}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 px-3 py-2.5 rounded-xl",
          "font-body text-sm font-medium transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          isActive
            ? "bg-primary-500 text-white shadow-sm"
            : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "w-4 h-4 flex-shrink-0 transition-colors duration-200",
              isActive
                ? "text-white"
                : "text-gray-400 group-hover:text-gray-600",
            )}
            aria-hidden="true"
          />
          <span className="flex-1 truncate">{item.label}</span>
          {isActive && (
            <ChevronRight
              className="w-3.5 h-3.5 text-white/70 flex-shrink-0"
              aria-hidden="true"
            />
          )}
        </>
      )}
    </NavLink>
  );
}

// ─── Sidebar content ──────────────────────────────────────────────────────────

function SidebarContent({ onNavClick }) {
  const { user } = useAuthStore();
  const { logoutMutation, isLoggingOut } = useAuth();
  const [showLogout, setShowLogout] = useState(false);
  const status = user?.status ?? "pending";

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-primary-500 flex items-center justify-center flex-shrink-0">
          <Truck className="w-5 h-5 text-white" aria-hidden="true" />
        </div>
        <div className="leading-none min-w-0">
          <p className="font-display font-bold text-gray-900 text-base">TAM</p>
          <p className="font-body text-gray-400 text-2xs uppercase tracking-widest mt-0.5">
            Member Portal
          </p>
        </div>
      </div>

      {/* User identity */}
      <div className="px-4 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
            <span className="font-body font-semibold text-gray-600 text-sm uppercase">
              {user?.email?.[0] ?? "M"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-body font-semibold text-gray-900 text-sm truncate">
              {user?.email ?? "Member"}
            </p>
            <div className="mt-1.5">
              <StatusBadge status={status} />
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav
        aria-label="Member portal navigation"
        className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto"
      >
        {NAV_ITEMS.map((item) => (
          <SidebarNavLink key={item.path} item={item} onClick={onNavClick} />
        ))}
      </nav>

      {/* Bottom — membership info + logout */}
      <div className="px-3 py-4 border-t border-gray-100 space-y-2 flex-shrink-0">
        {status === "active" && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-secondary-50 border border-secondary-100">
            <Shield
              className="w-4 h-4 text-secondary-500 flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="font-body text-secondary-700 text-xs leading-relaxed">
              Your membership is active and compliant.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowLogout(true)}
          disabled={isLoggingOut}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl",
            "font-body text-sm font-medium text-gray-500",
            "hover:text-primary-600 hover:bg-primary-50",
            "transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
            isLoggingOut && "opacity-50 cursor-wait",
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          {isLoggingOut ? "Signing out…" : "Sign Out"}
        </button>
      </div>

      <LogoutConfirmModal
        open={showLogout}
        onConfirm={() => {
          setShowLogout(false);
          logoutMutation.mutate();
        }}
        onCancel={() => setShowLogout(false)}
        isLoading={isLoggingOut}
      />
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

function usePageTitle() {
  const { pathname } = useLocation();
  const match = NAV_ITEMS.find((item) =>
    item.end ? pathname === item.path : pathname.startsWith(item.path),
  );
  if (match) return match.label;
  const segment = pathname.split("/").filter(Boolean).pop() ?? "";
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function Topbar({ onMenuOpen, notificationCount = 0 }) {
  const pageTitle = usePageTitle();
  const navigate = useNavigate();

  return (
    <header className="h-14 border-b border-gray-100 bg-white flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuOpen}
          aria-label="Open navigation menu"
          className={cn(
            "lg:hidden w-9 h-9 rounded-lg flex items-center justify-center",
            "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
            "transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          )}
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
        <h1 className="font-display font-bold text-gray-900 text-lg">
          {pageTitle}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate("/member/notifications")}
          aria-label={
            notificationCount > 0
              ? `${notificationCount} unread notifications`
              : "Notifications"
          }
          className={cn(
            "relative w-9 h-9 rounded-lg flex items-center justify-center",
            "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
            "transition-colors duration-200",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          )}
        >
          <Bell className="w-5 h-5" aria-hidden="true" />
          {notificationCount > 0 && (
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary-500"
              aria-hidden="true"
            />
          )}
        </button>
      </div>
    </header>
  );
}

// ─── Mobile drawer ────────────────────────────────────────────────────────────

const drawerVariants = {
  hidden: { x: "-100%", opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    x: "-100%",
    opacity: 0,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

const reducedDrawerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

function MobileDrawer({ open, onClose }) {
  const drawerRef = useRef(null);
  const closeButtonRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion
    ? reducedDrawerVariants
    : drawerVariants;

  useFocusTrap({
    containerRef: drawerRef,
    restoreFocusRef: { current: null },
    active: open,
    onEscape: onClose,
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            variants={variants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed top-0 left-0 h-full w-72 bg-white border-r border-gray-100 z-50 lg:hidden flex flex-col"
          >
            <div className="flex items-center justify-end px-4 pt-4 flex-shrink-0">
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Close navigation menu"
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  "text-gray-400 hover:text-gray-700 hover:bg-gray-100",
                  "transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
                )}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarContent onNavClick={onClose} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function MemberLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  const { data: unreadData } = useQuery({
    queryKey: NOTIFICATION_QUERY_KEYS.unreadCount,
    queryFn: async () => {
      const res = await notificationService.getUnreadCount();
      return res?.data?.data ?? res?.data ?? { count: 0 };
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 flex font-body">
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex lg:flex-col lg:w-60 xl:w-64 bg-white border-r border-gray-100 flex-shrink-0 sticky top-0 h-screen overflow-hidden"
        aria-label="Member portal sidebar"
      >
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          onMenuOpen={() => setMobileOpen(true)}
          notificationCount={unreadCount}
        />
        <main
          id="main-content"
          role="main"
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
