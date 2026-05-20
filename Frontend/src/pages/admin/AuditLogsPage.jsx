/**
 * @file pages/admin/AuditLogsPage.jsx
 * @module pages/admin
 *
 * Audit log viewer — filterable, paginated list of all admin actions.
 */

import { useState, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Shield,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  FileClock,
  Activity,
  ArrowUpDown,
  Eye,
  X,
} from "lucide-react";
import adminService, {
  ADMIN_QUERY_KEYS,
} from "../../services/admin.service.js";

/* ─── constants ──────────────────────────────────────────────────────────── */

const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "DOCUMENT_APPROVED", label: "Document Approved" },
  { value: "DOCUMENT_REJECTED", label: "Document Rejected" },
  { value: "DOCUMENT_RESUBMISSION_REQUESTED", label: "Resubmission Requested" },
  { value: "MEMBER_APPROVED", label: "Member Approved" },
  { value: "MEMBER_REJECTED", label: "Member Rejected" },
  { value: "MEMBER_SUSPENDED", label: "Member Suspended" },
  { value: "BROADCAST_SENT", label: "Broadcast Sent" },
  { value: "PROFILE_CREATED", label: "Profile Created" },
  { value: "PROFILE_UPDATED", label: "Profile Updated" },
  { value: "PROFILE_SUBMITTED", label: "Profile Submitted" },
  { value: "DOCUMENT_UPLOADED", label: "Document Uploaded" },
];

const TARGET_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "user", label: "User" },
  { value: "document", label: "Document" },
  { value: "broadcast", label: "Broadcast" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Outcomes" },
  { value: "SUCCESS", label: "Success" },
  { value: "FAILURE", label: "Failure" },
];

const SORT_OPTIONS = [
  { value: "createdAt", label: "Date" },
  { value: "action", label: "Action" },
  { value: "status", label: "Outcome" },
];

const SORT_DIR_OPTIONS = [
  { value: "desc", label: "Newest First" },
  { value: "asc", label: "Oldest First" },
];

const ACTION_CONFIG = {
  DOCUMENT_APPROVED: {
    label: "Document approved",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
  },
  DOCUMENT_REJECTED: {
    label: "Document rejected",
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
  },
  DOCUMENT_RESUBMISSION_REQUESTED: {
    label: "Resubmission requested",
    icon: FileClock,
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
  },
  MEMBER_APPROVED: {
    label: "Member approved",
    icon: UserCheck,
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
  },
  MEMBER_REJECTED: {
    label: "Member rejected",
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
  },
  MEMBER_SUSPENDED: {
    label: "Member suspended",
    icon: AlertCircle,
    color: "text-slate-600",
    bg: "bg-slate-50 border-slate-200",
  },
  BROADCAST_SENT: {
    label: "Broadcast sent",
    icon: Activity,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
  },
};

const FALLBACK_CONFIG = {
  label: "Admin action",
  icon: Activity,
  color: "text-slate-500",
  bg: "bg-slate-50 border-slate-200",
};

/* ─── helpers ────────────────────────────────────────────────────────────── */

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(d) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return formatDate(d);
}

/**
 * Safely extract a string from any MongoDB ObjectId shape:
 *  - plain string           "507f1f77..."
 *  - { $oid: "507f1f77..." }   (JSON serialised Extended JSON)
 *  - Mongoose ObjectId object  (has .toString())
 *  - null / undefined
 */
function resolveId(id) {
  if (id === null || id === undefined) return null;
  if (typeof id === "string") return id;
  if (typeof id === "object") {
    if (id.$oid && typeof id.$oid === "string") return id.$oid;
    if (typeof id.toString === "function") {
      const s = id.toString();
      if (s !== "[object Object]") return s;
    }
    // Last resort: pull first string-valued key that looks like a hex ObjectId
    for (const v of Object.values(id)) {
      if (typeof v === "string" && /^[a-f0-9]{24}$/i.test(v)) return v;
    }
  }
  return null;
}

function shortId(id) {
  const str = resolveId(id);
  if (!str) return "—";
  return str.length > 8 ? `…${str.slice(-6)}` : str;
}

function fullId(id) {
  return resolveId(id) ?? "—";
}

/* ─── sub-components ─────────────────────────────────────────────────────── */

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100">
      {[...Array(6)].map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
        </td>
      ))}
    </tr>
  );
}

function FilterSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all text-slate-700"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/* ─── Detail modal ───────────────────────────────────────────────────────── */

function DetailModal({ entry, onClose }) {
  if (!entry) return null;
  const config = ACTION_CONFIG[entry.action] ?? FALLBACK_CONFIG;
  const Icon = config.icon;

  const fields = [
    { label: "Action", value: entry.action ?? "—" },
    { label: "Target Type", value: entry.targetType ?? "—" },
    { label: "Actor ID", value: fullId(entry.actorId) },
    { label: "Target ID", value: fullId(entry.targetId) },
    { label: "Document ID", value: fullId(entry.documentId) },
    { label: "Document Type", value: entry.documentType ?? "—" },
    { label: "Previous Status", value: entry.previousStatus ?? "—" },
    { label: "New Status", value: entry.newStatus ?? "—" },
    { label: "Reason", value: entry.reason ?? "—" },
    { label: "IP Address", value: entry.ip ?? "—" },
    {
      label: "Date",
      value: `${formatDate(entry.createdAt)} ${formatTime(entry.createdAt)}`,
    },
    { label: "Outcome", value: entry.status ?? "—" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 border border-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center border ${config.bg}`}
            >
              <Icon className={`w-4 h-4 ${config.color}`} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Audit Entry
              </h2>
              <p className="text-xs text-slate-400">{config.label}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-0 divide-y divide-slate-50">
          {fields.map(({ label, value }) => (
            <div
              key={label}
              className="flex items-start justify-between gap-4 py-2.5"
            >
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex-shrink-0 w-32">
                {label}
              </span>
              <span className="text-sm text-slate-800 text-right break-all font-mono">
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    action: "",
    targetType: "",
    status: "",
    sortBy: "createdAt",
    sortDir: "desc",
    from: "",
    to: "",
  });
  const [selectedEntry, setSelectedEntry] = useState(null);

  const limit = 20;

  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== ""),
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ADMIN_QUERY_KEYS.auditLogs.list({
      ...activeFilters,
      page,
      limit,
    }),
    queryFn: () => adminService.getAuditLogs({ ...activeFilters, page, limit }),
    placeholderData: keepPreviousData,
  });

  const entries = data?.data ?? [];
  const meta = data?.meta ?? {};
  const total = meta.total ?? 0;
  const totalPages = meta.totalPages ?? (Math.ceil(total / limit) || 1);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      action: "",
      targetType: "",
      status: "",
      sortBy: "createdAt",
      sortDir: "desc",
      from: "",
      to: "",
    });
    setPage(1);
  }, []);

  const hasActiveFilters =
    filters.action ||
    filters.targetType ||
    filters.status ||
    filters.from ||
    filters.to;

  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-slate-400" />
              Audit Logs
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Complete history of all admin actions
            </p>
          </div>
          <div className="flex items-center gap-3">
            {total > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                {total.toLocaleString()} entries
              </span>
            )}
            <button
              onClick={() => refetch()}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <FilterSelect
            value={filters.action}
            onChange={(v) => setFilter("action", v)}
            options={ACTION_OPTIONS}
          />
          <FilterSelect
            value={filters.targetType}
            onChange={(v) => setFilter("targetType", v)}
            options={TARGET_TYPE_OPTIONS}
          />
          <FilterSelect
            value={filters.status}
            onChange={(v) => setFilter("status", v)}
            options={STATUS_OPTIONS}
          />

          {/* Date range */}
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilter("from", e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-700"
            title="From date"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilter("to", e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-700"
            title="To date"
          />

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}

          <div className="flex items-center gap-1.5 ml-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <FilterSelect
              value={filters.sortBy}
              onChange={(v) => setFilter("sortBy", v)}
              options={SORT_OPTIONS}
            />
            <FilterSelect
              value={filters.sortDir}
              onChange={(v) => setFilter("sortDir", v)}
              options={SORT_DIR_OPTIONS}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {["Action", "Actor", "Target", "Status", "Date", ""].map(
                    (h, i) => (
                      <th
                        key={i}
                        className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${i === 5 ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(8)].map((_, i) => <SkeletonRow key={i} />)
                ) : isError ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-slate-500"
                    >
                      <AlertCircle className="w-6 h-6 mx-auto mb-2 text-red-400" />
                      Failed to load audit logs.
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-16 text-center text-slate-400"
                    >
                      <Shield className="w-8 h-8 mx-auto mb-3 opacity-40" />
                      <p className="font-medium text-slate-500">
                        No audit entries found
                      </p>
                      <p className="text-xs mt-1">Try adjusting your filters</p>
                    </td>
                  </tr>
                ) : (
                  entries.map((entry, i) => {
                    const config =
                      ACTION_CONFIG[entry.action] ?? FALLBACK_CONFIG;
                    const Icon = config.icon;

                    return (
                      <tr
                        key={entry._id ?? i}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                      >
                        {/* Action */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border ${config.bg}`}
                            >
                              <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                            </div>
                            <div>
                              <p className="font-medium text-slate-800 leading-tight">
                                {config.label}
                              </p>
                              <p className="text-2xs text-slate-400 mt-0.5 font-mono">
                                {entry.action}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Actor */}
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                            {shortId(entry.actorId)}
                          </span>
                        </td>

                        {/* Target */}
                        <td className="px-4 py-3.5">
                          <div className="space-y-0.5">
                            {entry.targetType && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium bg-slate-100 text-slate-600 capitalize">
                                {entry.targetType}
                              </span>
                            )}
                            {entry.targetId && (
                              <p className="font-mono text-2xs text-slate-400">
                                {shortId(entry.targetId)}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Outcome */}
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                              entry.status === "SUCCESS"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-red-50 text-red-700 border-red-200"
                            }`}
                          >
                            {entry.status === "SUCCESS" ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            {entry.status === "SUCCESS" ? "OK" : "Failed"}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <div>
                              <p className="text-sm">
                                {formatRelative(entry.createdAt)}
                              </p>
                              <p className="text-2xs text-slate-400">
                                {formatDate(entry.createdAt)}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Detail */}
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => setSelectedEntry(entry)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!isLoading && !isError && total > limit && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
              <p className="text-xs text-slate-500">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)}{" "}
                of {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 text-xs text-slate-600 font-medium">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {selectedEntry && (
        <DetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}
