/**
 * @file pages/member/DashboardPage.jsx
 * @module pages/member
 *
 * Member portal dashboard — operational overview.
 *
 * Sections:
 *  1. Welcome header — member name, account status, member since
 *  2. Status banner — contextual guidance based on account status
 *  3. Stats row — fleet size, documents submitted, completion state, member since
 *  4. Profile completion card — progress bar + checklist
 *  5. Documents summary — per-document status grid
 *  6. Quick actions — primary CTAs for next steps
 *
 * Data:
 *  - GET /api/v1/members/me → profile shape from memberService.getProfileByUserId
 *  - Formatters from utils/formatters.js
 *
 * Loading / error states:
 *  - Skeleton shimmer on load
 *  - Inline error with retry on failure
 *  - Empty state if profile not yet created
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Truck,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  ChevronRight,
  User,
  Shield,
  Calendar,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import useAuthStore from "../../store/authStore.js";
import memberService, {
  MEMBER_QUERY_KEYS,
} from "../../services/member.service.js";
import {
  formatDate,
  formatRelativeTime,
  STATUS_CONFIG,
  DOCUMENT_TYPE_LABELS,
} from "../../utils/formatters.js";
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

// ─── Account status config ────────────────────────────────────────────────────

/**
 * Maps account status to banner appearance and guidance copy.
 * Drives the contextual status banner at the top of the dashboard.
 */
const ACCOUNT_BANNER = {
  pending: {
    icon: Clock,
    bg: "bg-amber-50 border-amber-200",
    iconColor: "text-amber-500",
    title: "Application Under Review",
    body: "Your profile has been submitted to TAM for verification. You will receive a notification once reviewed — this typically takes 2–3 business days.",
    cta: null,
  },
  active: {
    icon: Shield,
    bg: "bg-secondary-50 border-secondary-200",
    iconColor: "text-secondary-500",
    title: "Membership Active",
    body: "Your TAM membership is active and in good standing. Keep your profile and documents up to date to maintain compliance.",
    cta: { label: "View Profile", to: "/member/profile" },
  },
  rejected: {
    icon: XCircle,
    bg: "bg-primary-50 border-primary-200",
    iconColor: "text-primary-500",
    title: "Application Not Approved",
    body: "Your application was not approved in this review cycle. Please check your notifications for the reason and update your profile and documents before resubmitting.",
    cta: { label: "Update Profile", to: "/member/profile" },
  },
  suspended: {
    icon: AlertTriangle,
    bg: "bg-gray-50 border-gray-300",
    iconColor: "text-gray-500",
    title: "Account Suspended",
    body: "Your account has been temporarily suspended. Please contact TAM directly for assistance.",
    cta: null,
  },
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
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      {/* Banner skeleton */}
      <Skeleton className="h-20 w-full rounded-xl" />
      {/* Stats row skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      {/* Cards skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, accent, index }) {
  return (
    <motion.div
      variants={fadeUp}
      custom={index}
      className="bg-white rounded-xl border border-gray-100 p-5 flex flex-col gap-3"
    >
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
          {value}
        </p>
        <p className="font-body text-gray-500 text-xs mt-1">{label}</p>
        {sub && (
          <p className="font-body text-gray-400 text-2xs mt-0.5">{sub}</p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Document status icon ─────────────────────────────────────────────────────

function DocStatusIcon({ status }) {
  const icons = {
    approved: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    pending: <Clock className="w-4 h-4 text-amber-500" />,
    rejected: <XCircle className="w-4 h-4 text-primary-500" />,
    expired: <AlertCircle className="w-4 h-4 text-gray-400" />,
  };
  return icons[status] ?? icons.pending;
}

// ─── Profile completion ───────────────────────────────────────────────────────

/**
 * Derives a completion checklist from the profile object.
 * Each item has a label, whether it's done, and a link to fix it.
 */
function buildChecklist(profile) {
  return [
    {
      label: "Business name provided",
      done: Boolean(profile?.businessName),
      to: "/member/profile",
    },
    {
      label: "Contact person added",
      done: Boolean(profile?.contactPerson),
      to: "/member/profile",
    },
    {
      label: "Phone number provided",
      done: Boolean(profile?.phoneNumber),
      to: "/member/profile",
    },
    {
      label: "Physical address added",
      done: Boolean(profile?.physicalAddress),
      to: "/member/profile",
    },
    {
      label: "Fleet details completed",
      done: Boolean(profile?.fleetSize && profile?.vehicleTypes?.length > 0),
      to: "/member/profile",
    },
    {
      label: "Documents uploaded",
      done: Boolean(profile?.documents?.length > 0),
      to: "/member/documents",
    },
  ];
}

function ProfileCompletionCard({ profile }) {
  const checklist = buildChecklist(profile);
  const completedCount = checklist.filter((i) => i.done).length;
  const percentage = Math.round((completedCount / checklist.length) * 100);
  const isComplete = completedCount === checklist.length;
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-gray-900 text-base">
            Profile Completion
          </h2>
          <p className="font-body text-gray-400 text-xs mt-0.5">
            {completedCount} of {checklist.length} steps complete
          </p>
        </div>
        <span
          className={cn(
            "font-display font-bold text-2xl leading-none",
            isComplete ? "text-secondary-500" : "text-primary-500",
          )}
        >
          {percentage}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: prefersReducedMotion ? `${percentage}%` : 0 }}
          animate={{ width: `${percentage}%` }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }
          }
          className={cn(
            "h-full rounded-full",
            isComplete ? "bg-secondary-500" : "bg-primary-500",
          )}
        />
      </div>

      {/* Checklist */}
      <ul className="space-y-2">
        {checklist.map((item) => (
          <li key={item.label}>
            {item.done ? (
              <div className="flex items-center gap-2.5">
                <CheckCircle2
                  className="w-4 h-4 text-secondary-500 flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="font-body text-sm text-gray-500 line-through">
                  {item.label}
                </span>
              </div>
            ) : (
              <Link
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 group",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-primary-500 focus-visible:ring-offset-1 rounded",
                )}
              >
                <div className="w-4 h-4 rounded-full border-2 border-gray-200 flex-shrink-0 group-hover:border-primary-400 transition-colors" />
                <span className="font-body text-sm text-gray-700 group-hover:text-primary-600 transition-colors">
                  {item.label}
                </span>
                <ChevronRight
                  className="w-3.5 h-3.5 text-gray-300 group-hover:text-primary-400 transition-colors ml-auto"
                  aria-hidden="true"
                />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Documents summary card ───────────────────────────────────────────────────

function DocumentsSummaryCard({ documents }) {
  const hasDocuments = documents?.length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-gray-900 text-base">
            Documents
          </h2>
          <p className="font-body text-gray-400 text-xs mt-0.5">
            KYC verification files
          </p>
        </div>
        <Link
          to="/member/documents"
          className={cn(
            "inline-flex items-center gap-1 font-body text-xs font-medium",
            "text-primary-600 hover:text-primary-700 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-primary-500 focus-visible:ring-offset-1 rounded",
          )}
        >
          Manage
          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      {hasDocuments ? (
        <ul className="space-y-2">
          {documents.map((doc) => {
            const config = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.pending;
            const typeLabel =
              DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType;

            return (
              <li
                key={doc._id ?? doc.documentType}
                className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <DocStatusIcon status={doc.status} />
                  <div className="min-w-0">
                    <p className="font-body text-sm font-medium text-gray-900 truncate">
                      {typeLabel}
                    </p>
                    <p className="font-body text-2xs text-gray-400">
                      {doc.uploadedAt
                        ? formatRelativeTime(doc.uploadedAt)
                        : "Not uploaded"}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-2xs font-body font-medium flex-shrink-0",
                    config.color,
                  )}
                >
                  {config.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-8 gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
            <FileText className="w-5 h-5 text-gray-300" aria-hidden="true" />
          </div>
          <div className="text-center">
            <p className="font-body text-sm text-gray-500">
              No documents uploaded yet
            </p>
            <p className="font-body text-xs text-gray-400 mt-0.5">
              Upload your KYC documents to proceed
            </p>
          </div>
          <Link
            to="/member/documents"
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
              "bg-primary-500 text-white font-body text-xs font-medium",
              "hover:bg-primary-600 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
            )}
          >
            Upload Documents
          </Link>
        </div>
      )}
    </div>
  );
}

// ─── Quick actions ────────────────────────────────────────────────────────────

function QuickActions({ profile }) {
  const status = profile?.user?.status ?? "pending";
  const isComplete = profile?.isComplete;
  const hasDocuments = profile?.documents?.length > 0;
  const isApproved = profile?.isApproved;

  const actions = [
    {
      label: "Edit Profile",
      description: "Update your business details",
      to: "/member/profile",
      icon: User,
      show: !isApproved,
      accent: "bg-gray-50 text-gray-600 border-gray-100",
    },
    {
      label: "Upload Documents",
      description: "Submit KYC verification files",
      to: "/member/documents",
      icon: FileText,
      show: !hasDocuments,
      accent: "bg-amber-50 text-amber-600 border-amber-100",
    },
    {
      label: "View Documents",
      description: "Check document review status",
      to: "/member/documents",
      icon: FileText,
      show: hasDocuments,
      accent: "bg-gray-50 text-gray-600 border-gray-100",
    },
    {
      label: "Notifications",
      description: "Messages from TAM secretariat",
      to: "/member/notifications",
      icon: Shield,
      show: true,
      accent: "bg-secondary-50 text-secondary-600 border-secondary-100",
    },
  ].filter((a) => a.show);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-5">
      <div>
        <h2 className="font-display font-bold text-gray-900 text-base">
          Quick Actions
        </h2>
        <p className="font-body text-gray-400 text-xs mt-0.5">
          {status === "pending"
            ? "Complete these steps to activate your membership"
            : "Common tasks"}
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

// ─── Status banner ────────────────────────────────────────────────────────────

function StatusBanner({ status }) {
  const config = ACCOUNT_BANNER[status] ?? ACCOUNT_BANNER.pending;
  const Icon = config.icon;

  return (
    <motion.div
      variants={fadeUp}
      custom={0}
      className={cn("flex items-start gap-4 p-4 rounded-xl border", config.bg)}
      role="status"
      aria-live="polite"
    >
      <Icon
        className={cn("w-5 h-5 flex-shrink-0 mt-0.5", config.iconColor)}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="font-body font-semibold text-gray-900 text-sm">
          {config.title}
        </p>
        <p className="font-body text-gray-600 text-xs mt-1 leading-relaxed">
          {config.body}
        </p>
      </div>
      {config.cta && (
        <Link
          to={config.cta.to}
          className={cn(
            "flex-shrink-0 inline-flex items-center gap-1",
            "font-body text-xs font-medium text-gray-700",
            "hover:text-gray-900 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-primary-500 focus-visible:ring-offset-1 rounded",
          )}
        >
          {config.cta.label}
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      )}
    </motion.div>
  );
}

// ─── No profile state ─────────────────────────────────────────────────────────

function NoProfileState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center">
        <User className="w-7 h-7 text-gray-300" aria-hidden="true" />
      </div>
      <div className="text-center max-w-xs">
        <p className="font-display font-bold text-gray-900 text-lg">
          No profile yet
        </p>
        <p className="font-body text-gray-500 text-sm mt-1">
          Create your member profile to begin the TAM membership process.
        </p>
      </div>
      <Link
        to="/member/profile"
        className={cn(
          "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl",
          "bg-primary-500 text-white font-body text-sm font-medium",
          "hover:bg-primary-600 transition-colors shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
        )}
      >
        Create Profile
        <ChevronRight className="w-4 h-4" aria-hidden="true" />
      </Link>
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
          There was a problem fetching your profile data.
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

export default function DashboardPage() {
  const { user } = useAuthStore();
  const prefersReducedMotion = useReducedMotion();

  const {
    data: profileData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: MEMBER_QUERY_KEYS.profile,
    queryFn: memberService.getProfile,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Backend wraps in ApiResponse envelope — unwrap the data layer
  const profile = profileData?.data ?? profileData ?? null;
  const accountStatus = user?.status ?? profile?.user?.status ?? "pending";

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) return <DashboardSkeleton />;

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError) {
    // 404 means the member hasn't created a profile yet — not a true error
    if (error?.status === 404) return <NoProfileState />;
    return <ErrorState onRetry={refetch} />;
  }

  // ── No profile ─────────────────────────────────────────────────────────────
  if (!profile) return <NoProfileState />;

  // ── Stats ──────────────────────────────────────────────────────────────────
  const approvedDocCount =
    profile.documents?.filter((d) => d.status === "approved").length ?? 0;
  const totalDocCount = profile.documents?.length ?? 0;
  const memberSince = profile.createdAt ? formatDate(profile.createdAt) : "—";
  const vehicleTypesList = profile.vehicleTypes?.join(", ") || "—";

  const stats = [
    {
      icon: Truck,
      label: "Fleet Size",
      value: profile.fleetSize ?? "—",
      sub: profile.fleetSize ? "vehicles registered" : "not set",
      accent: "bg-gray-900 text-white",
    },
    {
      icon: FileText,
      label: "Documents",
      value: `${approvedDocCount}/${totalDocCount}`,
      sub: totalDocCount > 0 ? "approved / uploaded" : "none uploaded",
      accent: "bg-primary-50 text-primary-500",
    },
    {
      icon: CheckCircle2,
      label: "Profile Status",
      value: profile.isComplete ? "Complete" : "Incomplete",
      sub: profile.isApproved ? "approved by TAM" : "pending review",
      accent: profile.isComplete
        ? "bg-secondary-50 text-secondary-500"
        : "bg-amber-50 text-amber-500",
    },
    {
      icon: Calendar,
      label: "Member Since",
      value: memberSince,
      sub: profile.city ?? "—",
      accent: "bg-gray-50 text-gray-500",
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────
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
          {profile.businessName
            ? `Welcome, ${profile.businessName}`
            : "Welcome back"}
        </h1>
        <p className="font-body text-gray-400 text-sm mt-1">
          {profile.contactPerson && `${profile.contactPerson} · `}
          {profile.city && `${profile.city} · `}
          Member since {memberSince}
        </p>
      </motion.div>

      {/* ── Status banner ──────────────────────────────────────────────────── */}
      <StatusBanner status={accountStatus} />

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
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        <motion.div variants={fadeUp} custom={5}>
          <ProfileCompletionCard profile={profile} />
        </motion.div>

        <motion.div variants={fadeUp} custom={6}>
          <DocumentsSummaryCard documents={profile.documents} />
        </motion.div>
      </motion.div>

      {/* ── Quick actions ──────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} custom={7}>
        <QuickActions profile={profile} />
      </motion.div>
    </motion.div>
  );
}
