/**
 * @file pages/admin/AdminNotificationsPage.jsx
 * @module pages/admin
 *
 * Admin notification log — view, delete, and resend transactional notifications
 * sent to members.
 *
 * UX contract:
 *  - Table: member · type badge · title + preview · status badge · sent · [···]
 *  - Filters: type, status, member search
 *  - Actions: Delete, Resend (fires new notification of same type/title/message)
 *  - Pagination: matches Documents/Members page pattern
 */

import { useState, useCallback, useMemo } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  Bell,
  Trash2,
  RotateCcw,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  X,
  AlertTriangle,
  CheckCircle,
  Clock,
  Archive,
  Filter,
  RefreshCw,
  User,
  Send,
} from "lucide-react";
import adminService, {
  ADMIN_QUERY_KEYS,
} from "../../services/admin.service.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const NOTIFICATION_TYPE_META = {
  BROADCAST: {
    label: "Broadcast",
    className: "bg-violet-50 text-violet-700 border border-violet-200",
  },
  ACCOUNT_ACTION: {
    label: "Account",
    className: "bg-primary-50 text-primary-700 border border-primary-100",
  },
  DOCUMENT: {
    label: "Document",
    className: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  SYSTEM: {
    label: "System",
    className: "bg-slate-100 text-slate-600 border border-slate-200",
  },
  COMPLIANCE: {
    label: "Compliance",
    className: "bg-red-50 text-red-700 border border-red-200",
  },
  WELCOME: {
    label: "Welcome",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
};

const STATUS_META = {
  UNREAD: {
    label: "Unread",
    className: "bg-blue-50 text-blue-700 border border-blue-200",
    Icon: Clock,
  },
  READ: {
    label: "Read",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    Icon: CheckCircle,
  },
  ARCHIVED: {
    label: "Archived",
    className: "bg-slate-100 text-slate-500 border border-slate-200",
    Icon: Archive,
  },
};

const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "BROADCAST", label: "Broadcast" },
  { value: "ACCOUNT_ACTION", label: "Account Action" },
  { value: "DOCUMENT", label: "Document" },
  { value: "SYSTEM", label: "System" },
  { value: "COMPLIANCE", label: "Compliance" },
  { value: "WELCOME", label: "Welcome" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "UNREAD", label: "Unread" },
  { value: "READ", label: "Read" },
  { value: "ARCHIVED", label: "Archived" },
];

const PAGE_LIMIT = 20;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFull(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────── */

function TypeBadge({ type }) {
  const meta = NOTIFICATION_TYPE_META[type] ?? {
    label: type,
    className: "bg-slate-100 text-slate-600 border border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    className: "bg-slate-100 text-slate-500 border border-slate-200",
    Icon: Clock,
  };
  const { Icon } = meta;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${meta.className}`}
    >
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

function OverflowMenu({ notification, onDelete, onResend }) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        aria-label="Actions"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute right-0 top-8 z-20 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 overflow-hidden">
            <button
              onClick={() => {
                onResend(notification);
                close();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Send className="w-3.5 h-3.5 text-slate-400" />
              Resend notification
            </button>
            <div className="mx-3 my-1 border-t border-slate-100" />
            <button
              onClick={() => {
                onDelete(notification);
                close();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel,
  variant = "danger",
  onConfirm,
  onClose,
  loading,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
              variant === "danger" ? "bg-red-100" : "bg-amber-100"
            }`}
          >
            <AlertTriangle
              className={`w-4.5 h-4.5 ${variant === "danger" ? "text-red-600" : "text-amber-600"}`}
            />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-amber-500 hover:bg-amber-600"
            }`}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResendModal({ notification, onConfirm, onClose, loading }) {
  if (!notification) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center flex-shrink-0">
              <RotateCcw className="w-4 h-4 text-primary-600" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              Resend Notification
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 mb-5 space-y-2">
          <div className="flex items-center gap-2">
            <TypeBadge type={notification.type} />
            <StatusBadge status={notification.status} />
          </div>
          <p className="text-sm font-medium text-slate-900">
            {notification.title}
          </p>
          <p className="text-xs text-slate-500 line-clamp-2">
            {notification.message}
          </p>
          {notification.user && (
            <div className="flex items-center gap-1.5 pt-1">
              <User className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-500">
                {notification.user?.email ??
                  notification.user?.profile?.contactPerson ??
                  String(notification.user)}
              </span>
            </div>
          )}
        </div>

        <p className="text-sm text-slate-500 mb-5">
          This will send a new copy of this notification to the member. The
          original record will remain unchanged.
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(notification)}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-60"
          >
            {loading ? "Sending…" : "Resend"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   EMPTY STATE
───────────────────────────────────────────── */

function EmptyState({ hasFilters }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <Bell className="w-6 h-6 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-900">
        {hasFilters
          ? "No notifications match your filters"
          : "No notifications yet"}
      </p>
      <p className="text-xs text-slate-400 mt-1 max-w-xs">
        {hasFilters
          ? "Try adjusting the type or status filters."
          : "Transactional notifications will appear here once member lifecycle events fire."}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────── */

export default function AdminNotificationsPage() {
  const queryClient = useQueryClient();

  /* ── Filter state ── */
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchInput, setMemberSearchInput] = useState("");

  /* ── Modal state ── */
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resendTarget, setResendTarget] = useState(null);

  /* ── Query params ── */
  const queryParams = useMemo(
    () => ({
      page,
      limit: PAGE_LIMIT,
      ...(typeFilter && { type: typeFilter }),
      ...(statusFilter && { status: statusFilter }),
      ...(memberSearch && { member: memberSearch }),
    }),
    [page, typeFilter, statusFilter, memberSearch],
  );

  /* ── Data fetch ── */
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ADMIN_QUERY_KEYS.notifications.list(queryParams),
    queryFn: async () => {
      const res = await adminService.getNotifications(queryParams);
      return (
        res?.data?.data ??
        res?.data ?? { notifications: [], total: 0, page: 1, pages: 1 }
      );
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const notifications = data?.notifications ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.pages ?? 1;

  /* ── Delete mutation ── */
  const deleteMutation = useMutation({
    mutationFn: (id) => adminService.deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ADMIN_QUERY_KEYS.notifications.all,
      });
      setDeleteTarget(null);
    },
  });

  /* ── Resend mutation ── */
  const resendMutation = useMutation({
    mutationFn: (id) => adminService.resendNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ADMIN_QUERY_KEYS.notifications.all,
      });
      setResendTarget(null);
    },
  });

  /* ── Handlers ── */
  const handleSearchSubmit = useCallback(
    (e) => {
      e.preventDefault();
      setMemberSearch(memberSearchInput.trim());
      setPage(1);
    },
    [memberSearchInput],
  );

  const handleClearSearch = useCallback(() => {
    setMemberSearch("");
    setMemberSearchInput("");
    setPage(1);
  }, []);

  const handleTypeChange = useCallback((e) => {
    setTypeFilter(e.target.value);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((e) => {
    setStatusFilter(e.target.value);
    setPage(1);
  }, []);

  const hasFilters = !!(typeFilter || statusFilter || memberSearch);

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            All transactional notifications sent to members.
            {total > 0 && (
              <span className="ml-1 font-medium text-slate-700">
                {total.toLocaleString()} total
              </span>
            )}
          </p>
        </div>

        <button
          onClick={() =>
            queryClient.invalidateQueries({
              queryKey: ADMIN_QUERY_KEYS.notifications.all,
            })
          }
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Member search */}
        <form
          onSubmit={handleSearchSubmit}
          className="relative flex items-center flex-1 min-w-0"
        >
          <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={memberSearchInput}
            onChange={(e) => setMemberSearchInput(e.target.value)}
            placeholder="Search by member email…"
            className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 placeholder:text-slate-400"
          />
          {memberSearchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2 p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>

        {/* Type filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <select
            value={typeFilter}
            onChange={handleTypeChange}
            className="pl-8 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 appearance-none cursor-pointer"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={handleStatusChange}
            className="pl-8 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 appearance-none cursor-pointer"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={() => {
              setTypeFilter("");
              setStatusFilter("");
              setMemberSearch("");
              setMemberSearchInput("");
              setPage(1);
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
            <p className="text-sm font-medium text-slate-900">
              Failed to load notifications
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Check your connection and try again.
            </p>
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Member
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Type
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Notification
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Sent
                  </th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {notifications.map((n) => {
                  const id = String(n._id);
                  const email =
                    n.user?.email ??
                    n.user?.profile?.contactPerson ??
                    (typeof n.user === "string" ? n.user : id);

                  return (
                    <tr
                      key={id}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      {/* Member */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                          <span className="text-xs text-slate-600 truncate max-w-[160px]">
                            {email}
                          </span>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <TypeBadge type={n.type} />
                      </td>

                      {/* Notification */}
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {n.title}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {n.message}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={n.status} />
                      </td>

                      {/* Sent */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className="text-xs text-slate-500"
                          title={formatFull(n.createdAt)}
                        >
                          {timeAgo(n.createdAt)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <OverflowMenu
                          notification={n}
                          onDelete={setDeleteTarget}
                          onResend={setResendTarget}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages} · {total.toLocaleString()}{" "}
              notifications
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete notification"
          message={`Delete "${deleteTarget.title}"? This permanently removes the notification record and cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(String(deleteTarget._id))}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {resendTarget && (
        <ResendModal
          notification={resendTarget}
          loading={resendMutation.isPending}
          onConfirm={(n) => resendMutation.mutate(String(n._id))}
          onClose={() => setResendTarget(null)}
        />
      )}
    </div>
  );
}
