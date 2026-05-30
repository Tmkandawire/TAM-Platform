/**
 * @file pages/admin/DashboardPage.jsx
 * @module pages/admin
 *
 * Admin portal dashboard — operational overview.
 *
 * Sections:
 *  1. Welcome header — admin name, current date
 *  2. Stats row — pending members, pending documents, active members, total members
 *  3. Recent activity feed — latest audit log entries
 *  4. Quick actions — primary CTAs for admin workflows
 *
 * Data:
 *  - GET /api/v1/admin/members/pending     → pending member count
 *  - GET /api/v1/admin/documents/pending   → pending document queue count
 *  - GET /api/v1/admin/audit-logs          → recent activity feed (limit=8)
 *
 * Loading / error states:
 *  - Skeleton shimmer on load
 *  - Inline error with retry on failure
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Users,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  ChevronRight,
  Shield,
  RefreshCw,
  Activity,
  TrendingUp,
  UserCheck,
  FileClock,
  ClipboardList,
} from "lucide-react";
import useAuthStore from "../../store/authStore.js";
import adminService, {
  ADMIN_QUERY_KEYS,
} from "../../services/admin.service.js";
import { formatRelativeTime } from "../../utils/formatters.js";
import { cn } from "../../utils/cn.js";

// ─── Animation variants ───────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: i * 0.07 },
  }),
};

// ─── Audit action config ──────────────────────────────────────────────────────

/**
 * Maps audit action strings to display labels and icon colour.
 * Falls back to a neutral config for unknown actions.
 */
const AUDIT_ACTION_CONFIG = {
  DOCUMENT_APPROVED: {
    label: "Document approved",
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-50",
  },
  DOCUMENT_REJECTED: {
    label: "Document rejected",
    icon: XCircle,
    color: "text-primary-500",
    bg: "bg-primary-50",
  },
  DOCUMENT_RESUBMISSION_REQUESTED: {
    label: "Resubmission requested",
    icon: FileClock,
    color: "text-amber-500",
    bg: "bg-amber-50",
  },
  MEMBER_APPROVED: {
    label: "Member approved",
    icon: UserCheck,
    color: "text-secondary-500",
    bg: "bg-secondary-50",
  },
  MEMBER_REJECTED: {
    label: "Member rejected",
    icon: XCircle,
    color: "text-primary-500",
    bg: "bg-primary-50",
  },
  MEMBER_SUSPENDED: {
    label: "Member suspended",
    icon: AlertCircle,
    color: "text-gray-500",
    bg: "bg-gray-100",
  },
};

const FALLBACK_ACTION_CONFIG = {
  label: "Admin action",
  icon: Activity,
  color: "text-gray-400",
  bg: "bg-gray-50",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-gray-100", className)} />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, accent, badge, index }) {
  return (
    <motion.div
      variants={fadeUp}
      custom={index}
      className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3 relative overflow-hidden"
    >
      {badge && (
        <span className="absolute top-3 right-3 inline-flex items-center px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-600 font-body text-2xs font-semibold">
          {badge}
        </span>
      )}
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
          accent,
        )}
      >
        <Icon className="w-4.5 h-4.5" aria-hidden="true" />
      </div>
      <div>
        <p className="font-display font-bold text-gray-900 text-2xl leading-none">
          {value ?? "—"}
        </p>
        <p className="font-body text-gray-500 text-xs mt-1">{label}</p>
        {sub && (
          <p className="font-body text-gray-400 text-2xs mt-0.5">{sub}</p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Activity feed ────────────────────────────────────────────────────────────

function ActivityFeed({ entries, isLoading, isError, onRetry }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <AlertCircle className="w-8 h-8 text-gray-300" aria-hidden="true" />
        <p className="font-body text-sm text-gray-400">
          Failed to load activity
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
            "font-body text-xs font-medium text-gray-600",
            "border border-gray-200 hover:bg-gray-50 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
          )}
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

  if (!entries?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <Activity className="w-8 h-8 text-gray-200" aria-hidden="true" />
        <p className="font-body text-sm text-gray-400">No recent activity</p>
      </div>
    );
  }

  return (
    <ul className="space-y-1" role="list">
      {entries.map((entry, i) => {
        const config =
          AUDIT_ACTION_CONFIG[entry.action] ?? FALLBACK_ACTION_CONFIG;
        const Icon = config.icon;

        return (
          <li
            key={entry._id ?? i}
            className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0"
          >
            <div
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                config.bg,
              )}
            >
              <Icon
                className={cn("w-3.5 h-3.5", config.color)}
                aria-hidden="true"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm text-gray-800 leading-snug">
                {config.label}
                {entry.targetId && (
                  <span className="text-gray-400 font-normal">
                    {" "}
                    · {entry.targetType ?? "resource"}
                  </span>
                )}
              </p>
              <p className="font-body text-2xs text-gray-400 mt-0.5">
                {entry.actorId ? `By admin · ` : ""}
                {entry.createdAt ? formatRelativeTime(entry.createdAt) : "—"}
              </p>
            </div>
            <span
              className={cn(
                "flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-2xs font-body font-medium",
                entry.status === "SUCCESS"
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-primary-50 text-primary-600",
              )}
            >
              {entry.status === "SUCCESS" ? "OK" : "Fail"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Quick actions ────────────────────────────────────────────────────────────

function QuickActions() {
  const actions = [
    {
      label: "Review Members",
      description: "Approve or reject pending applications",
      to: "/admin/members",
      icon: Users,
      accent: "bg-secondary-50 text-secondary-600 border-secondary-100",
    },
    {
      label: "Document Queue",
      description: "Review submitted KYC documents",
      to: "/admin/documents",
      icon: FileText,
      accent: "bg-amber-50 text-amber-600 border-amber-100",
    },
    {
      label: "Bulk Review",
      description: "Process multiple documents at once",
      to: "/admin/bulk-review",
      icon: ClipboardList,
      accent: "bg-gray-50 text-gray-600 border-gray-100",
    },
    {
      label: "Audit Logs",
      description: "Track all admin actions and changes",
      to: "/admin/audit-logs",
      icon: Shield,
      accent: "bg-gray-50 text-gray-600 border-gray-100",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-5">
      <div>
        <h2 className="font-display font-bold text-gray-900 text-base">
          Quick Actions
        </h2>
        <p className="font-body text-gray-400 text-xs mt-0.5">
          Common admin workflows
        </p>
      </div>

      <div className="space-y-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              to={action.to}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border transition-all duration-200",
                "hover:shadow-sm hover:border-gray-200",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
                action.accent,
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="font-body text-sm font-medium text-gray-900">
                  {action.label}
                </p>
                <p className="font-body text-xs text-gray-400">
                  {action.description}
                </p>
              </div>
              <ChevronRight
                className="w-4 h-4 text-gray-300 flex-shrink-0"
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({ onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center">
        <AlertCircle className="w-7 h-7 text-primary-400" aria-hidden="true" />
      </div>
      <div className="text-center max-w-xs">
        <p className="font-display font-bold text-gray-900 text-lg">
          Failed to load dashboard
        </p>
        <p className="font-body text-gray-500 text-sm mt-1">
          There was a problem fetching admin data.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl",
          "bg-gray-900 text-white font-body text-sm font-medium",
          "hover:bg-gray-800 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-gray-900 focus-visible:ring-offset-2",
        )}
      >
        <RefreshCw className="w-4 h-4" aria-hidden="true" />
        Try Again
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { user } = useAuthStore();
  const prefersReducedMotion = useReducedMotion();

  // ── Pending members count ──────────────────────────────────────────────────
  const {
    data: pendingMembersData,
    isLoading: pendingMembersLoading,
    isError: pendingMembersError,
    refetch: refetchPendingMembers,
  } = useQuery({
    queryKey: ADMIN_QUERY_KEYS.pendingMembers,
    queryFn: () => adminService.getPendingMembers({ page: 1, limit: 1 }),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  // ── Pending documents count ────────────────────────────────────────────────
  const {
    data: pendingDocsData,
    isLoading: pendingDocsLoading,
    isError: pendingDocsError,
    refetch: refetchPendingDocs,
  } = useQuery({
    queryKey: ADMIN_QUERY_KEYS.pendingDocuments,
    queryFn: () => adminService.getPendingDocuments({ page: 1, limit: 50 }),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  // ── Recent audit activity ──────────────────────────────────────────────────
  const {
    data: auditData,
    isLoading: auditLoading,
    isError: auditError,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: ADMIN_QUERY_KEYS.recentActivity,
    queryFn: () => adminService.getAuditLogs({ limit: 8, page: 1 }),
    staleTime: 60 * 1000,
    retry: 1,
  });

  const {
    data: memberStatsData,
    isLoading: memberStatsLoading,
    isError: memberStatsError,
    refetch: refetchMemberStats,
  } = useQuery({
    queryKey: ADMIN_QUERY_KEYS.memberStats,
    queryFn: () => adminService.getMemberStats(),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  const isLoading =
    pendingMembersLoading &&
    pendingDocsLoading &&
    auditLoading &&
    memberStatsLoading;
  const isError =
    pendingMembersError && pendingDocsError && auditError && memberStatsError;

  const handleRetryAll = () => {
    refetchPendingMembers();
    refetchPendingDocs();
    refetchAudit();
    refetchMemberStats();
  };

  if (isLoading) return <DashboardSkeleton />;
  if (isError) return <ErrorState onRetry={handleRetryAll} />;

  // ── Unwrap ApiResponse envelopes ───────────────────────────────────────────
  const pendingMembersTotal = pendingMembersData?.meta?.total ?? 0;

  const pendingDocsTotal = (pendingDocsData?.data ?? []).flatMap(
    (item) => item.documents ?? [],
  ).length;

  const auditEntries = auditData?.data ?? auditData?.data?.data ?? [];

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const stats = [
    {
      icon: Clock,
      label: "Pending Members",
      value: pendingMembersLoading ? "…" : pendingMembersTotal,
      sub: "awaiting review",
      accent: "bg-amber-50 text-amber-500",
      badge: pendingMembersTotal > 0 ? "Action needed" : null,
    },
    {
      icon: FileText,
      label: "Pending Documents",
      value: pendingDocsLoading ? "…" : pendingDocsTotal,
      sub: "in review queue",
      accent: "bg-primary-50 text-primary-500",
      badge: pendingDocsTotal > 0 ? "Action needed" : null,
    },
    {
      icon: TrendingUp,
      label: "Active Members",
      value: memberStatsLoading ? "…" : (memberStatsData?.data?.active ?? "—"),
      sub: "fully approved",
      accent: "bg-secondary-50 text-secondary-500",
    },
    {
      icon: Users,
      label: "Total Members",
      value: memberStatsLoading ? "…" : (memberStatsData?.data?.total ?? "—"),
      sub: "all statuses",
      accent: "bg-gray-900 text-white",
    },
  ];

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        visible: {
          transition: { staggerChildren: prefersReducedMotion ? 0 : 0.07 },
        },
      }}
      className="space-y-6 max-w-5xl"
    >
      {/* ── Welcome header ─────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} custom={0}>
        <h1 className="font-display font-bold text-gray-900 text-2xl sm:text-3xl">
          Admin Dashboard
        </h1>
        <p className="font-body text-gray-400 text-sm mt-1">
          {user?.email && `${user.email} · `}
          {today}
        </p>
      </motion.div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <motion.div
        variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {stats.map((stat, i) => (
          <StatCard key={stat.label} {...stat} index={i + 1} />
        ))}
      </motion.div>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <motion.div
        variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Activity feed — 2/3 width */}
        <motion.div
          variants={fadeUp}
          custom={5}
          className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-gray-900 text-base">
                Recent Activity
              </h2>
              <p className="font-body text-gray-400 text-xs mt-0.5">
                Latest admin actions across the platform
              </p>
            </div>
            <Link
              to="/admin/audit-logs"
              className={cn(
                "inline-flex items-center gap-1 font-body text-xs font-medium",
                "text-primary-600 hover:text-primary-700 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary-500 focus-visible:ring-offset-1 rounded",
              )}
            >
              View all
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>

          <ActivityFeed
            entries={auditEntries}
            isLoading={auditLoading}
            isError={auditError}
            onRetry={refetchAudit}
          />
        </motion.div>

        {/* Quick actions — 1/3 width */}
        <motion.div variants={fadeUp} custom={6}>
          <QuickActions />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
