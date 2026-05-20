/**
 * @file pages/admin/DocumentsPage.jsx
 * @module pages/admin
 *
 * Document review queue — all documents across all members.
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  FileSearch,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileText,
  AlertCircle,
  Loader2,
  Filter,
  Eye,
  Clock,
  ArrowUpDown,
} from "lucide-react";
import adminService, {
  ADMIN_QUERY_KEYS,
} from "../../services/admin.service.js";

/* ─── constants ──────────────────────────────────────────────────────────── */

const DOC_TYPE_LABELS = {
  nationalId: "National ID",
  passport: "Passport",
  utilityBill: "Utility Bill",
  businessCert: "Business Certificate",
  tinCertificate: "TIN Certificate",
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "resubmission_required", label: "Resubmission Required" },
  { value: "expired", label: "Expired" },
];

const DOC_TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "nationalId", label: "National ID" },
  { value: "passport", label: "Passport" },
  { value: "utilityBill", label: "Utility Bill" },
  { value: "businessCert", label: "Business Certificate" },
  { value: "tinCertificate", label: "TIN Certificate" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const SORT_OPTIONS = [
  { value: "priority", label: "Priority" },
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
];

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  resubmission_required: "bg-orange-100 text-orange-800 border-orange-200",
  expired: "bg-slate-100 text-slate-600 border-slate-200",
};

const PRIORITY_STYLES = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
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

/* ─── Reject modal ───────────────────────────────────────────────────────── */

function RejectModal({ doc, onConfirm, onClose, isPending }) {
  const [reason, setReason] = useState("");
  const isValid = reason.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Reject Document
            </h2>
            <p className="text-sm text-slate-500">
              {DOC_TYPE_LABELS[doc?.documentType] ?? doc?.documentType}
            </p>
          </div>
        </div>
        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Explain why the document is being rejected. Min 10 characters."
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 resize-none transition-all"
          />
          <p className="text-xs text-slate-400 mt-1">
            {reason.trim().length} / 500
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!isValid || isPending}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Skeleton row ───────────────────────────────────────────────────────── */

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

/* ─── Filter select ──────────────────────────────────────────────────────── */

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

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function DocumentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    status: "",
    documentType: "",
    priority: "",
    sortBy: "priority",
  });
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [actionError, setActionError] = useState(null);

  const limit = 10;

  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== ""),
  );

  /* ── Data ── */
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ADMIN_QUERY_KEYS.documents.queue({
      ...activeFilters,
      page,
      limit,
    }),
    queryFn: () =>
      adminService.getPendingDocuments({ ...activeFilters, page, limit }),
    placeholderData: keepPreviousData,
  });

  const rawRows = data?.data ?? [];
  const docs = rawRows.flatMap((item) =>
    (item.documents ?? []).map((doc) => ({
      ...doc,
      userId: item.user,
      businessName: item.businessName ?? item.userInfo?.email ?? "—",
      contactPerson: item.contactPerson ?? "—",
      priority:
        doc.priorityLevel ??
        (item.overallPriorityScore > 55
          ? "HIGH"
          : item.overallPriorityScore > 25
            ? "MEDIUM"
            : "LOW"),
      userInfo: item.userInfo,
    })),
  );
  const meta = data?.meta ?? {};
  const total = docs.length;
  const totalPages = meta.totalPages ?? (Math.ceil(total / limit) || 1);

  /* ── Approve mutation ── */
  const approveMutation = useMutation({
    mutationFn: ({ userId, docId }) =>
      adminService.approveDocument(userId, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ADMIN_QUERY_KEYS.documents.all,
      });
      setApproveTarget(null);
      setActionError(null);
    },
    onError: (err) => setActionError(err.message ?? "Approval failed."),
  });

  /* ── Reject mutation ── */
  const rejectMutation = useMutation({
    mutationFn: ({ userId, docId, reason }) =>
      adminService.rejectDocument(userId, docId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ADMIN_QUERY_KEYS.documents.all,
      });
      setRejectTarget(null);
      setActionError(null);
    },
    onError: (err) => setActionError(err.message ?? "Rejection failed."),
  });

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const closeModals = useCallback(() => {
    setApproveTarget(null);
    setRejectTarget(null);
    setActionError(null);
  }, []);

  /* ── Render ── */
  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-slate-400" />
              Document Queue
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Review and action uploaded member documents
            </p>
          </div>
          <div className="flex items-center gap-3">
            {total > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                {total} document{total !== 1 ? "s" : ""}
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
        {/* Error banner */}
        {actionError && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {actionError}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <FilterSelect
            value={filters.status}
            onChange={(v) => setFilter("status", v)}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            value={filters.documentType}
            onChange={(v) => setFilter("documentType", v)}
            options={DOC_TYPE_OPTIONS}
          />
          <FilterSelect
            value={filters.priority}
            onChange={(v) => setFilter("priority", v)}
            options={PRIORITY_OPTIONS}
          />
          <div className="flex items-center gap-1.5 ml-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <FilterSelect
              value={filters.sortBy}
              onChange={(v) => setFilter("sortBy", v)}
              options={SORT_OPTIONS}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Document
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Member
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Uploaded
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Priority
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
                ) : isError ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-slate-500"
                    >
                      <AlertCircle className="w-6 h-6 mx-auto mb-2 text-red-400" />
                      Failed to load document queue.
                    </td>
                  </tr>
                ) : docs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-16 text-center text-slate-400"
                    >
                      <FileSearch className="w-8 h-8 mx-auto mb-3 opacity-40" />
                      <p className="font-medium text-slate-500">
                        No documents found
                      </p>
                      <p className="text-xs mt-1">Try adjusting your filters</p>
                    </td>
                  </tr>
                ) : (
                  docs.map((item) => {
                    const doc = item;
                    const userId = item.userId;
                    const docId = item._id;
                    const priority = (item.priority ?? "LOW").toUpperCase();

                    return (
                      <tr
                        key={`${userId}-${docId}`}
                        onClick={() =>
                          navigate(`/admin/documents/${userId}/${docId}`)
                        }
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-slate-500" />
                            </div>
                            <span className="font-medium text-slate-800">
                              {DOC_TYPE_LABELS[doc.documentType] ??
                                doc.documentType}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">
                          {item.businessName ?? "—"}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {formatDate(doc.uploadedAt ?? doc.createdAt)}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.LOW}`}
                          >
                            {priority}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${STATUS_STYLES[doc.status] ?? STATUS_STYLES.pending}`}
                          >
                            {doc.status?.replace("_", " ") ?? "pending"}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() =>
                                navigate(`/admin/documents/${userId}/${docId}`)
                              }
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                              title="View detail"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {doc.status === "pending" && (
                              <>
                                <button
                                  onClick={() =>
                                    setApproveTarget({ userId, docId, doc })
                                  }
                                  className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() =>
                                    setRejectTarget({ userId, docId, doc })
                                  }
                                  className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-200"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
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
                of {total}
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

      {/* Approve confirm */}
      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeModals}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Approve Document
                </h2>
                <p className="text-sm text-slate-500">
                  {DOC_TYPE_LABELS[approveTarget.doc?.documentType] ??
                    approveTarget.doc?.documentType}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              This document will be marked as approved. The member will be
              notified.
            </p>
            <div className="flex gap-3">
              <button
                onClick={closeModals}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  approveMutation.mutate({
                    userId: approveTarget.userId,
                    docId: approveTarget.docId,
                  })
                }
                disabled={approveMutation.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {approveMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          doc={rejectTarget.doc}
          isPending={rejectMutation.isPending}
          onClose={closeModals}
          onConfirm={(reason) =>
            rejectMutation.mutate({
              userId: rejectTarget.userId,
              docId: rejectTarget.docId,
              reason,
            })
          }
        />
      )}
    </div>
  );
}
