/**
 * @file pages/admin/BulkReviewPage.jsx
 * @module pages/admin
 *
 * Bulk document review — select multiple documents and approve or reject
 * them in a single request.
 *
 * Flow:
 *  1. Load pending documents from GET /admin/documents
 *  2. Admin selects one or more documents via checkboxes
 *  3. Admin picks Approve or Reject (reject requires a shared reason)
 *  4. POST /admin/documents/bulk-review
 *  5. Show per-item results (207 Multi-Status)
 */

import { useState, useCallback } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  ClipboardList,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertCircle,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  MinusSquare,
  Clock,
  X,
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

/* ─── Skeleton ───────────────────────────────────────────────────────────── */

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100">
      {[...Array(5)].map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
        </td>
      ))}
    </tr>
  );
}

/* ─── Confirm modal ──────────────────────────────────────────────────────── */

function ConfirmModal({ action, count, onConfirm, onClose, isPending }) {
  const [reason, setReason] = useState("");
  const isReject = action === "reject";
  const isValid = !isReject || reason.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-100">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isReject ? "bg-red-100" : "bg-emerald-100"}`}
          >
            {isReject ? (
              <XCircle className="w-5 h-5 text-red-600" />
            ) : (
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {isReject ? "Reject" : "Approve"} {count} Document
              {count !== 1 ? "s" : ""}
            </h2>
            <p className="text-sm text-slate-500">
              This action cannot be undone.
            </p>
          </div>
        </div>

        {isReject && (
          <div className="mb-5">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Reason <span className="text-red-500">*</span>
              <span className="text-slate-400 font-normal ml-1">
                (applies to all selected)
              </span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Minimum 10 characters…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 resize-none transition-all"
            />
            <p className="text-xs text-slate-400 mt-1">
              {reason.trim().length} / 500
            </p>
          </div>
        )}

        {!isReject && (
          <p className="text-sm text-slate-600 mb-5">
            All {count} selected document{count !== 1 ? "s" : ""} will be marked
            as approved.
          </p>
        )}

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
            className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
              isReject
                ? "bg-red-600 hover:bg-red-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isReject ? "Reject All" : "Approve All"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Results panel ──────────────────────────────────────────────────────── */

function ResultsPanel({ results, errors, onDismiss }) {
  const successCount = results?.filter((r) => r.success)?.length ?? 0;
  const failCount =
    (results?.filter((r) => !r.success)?.length ?? 0) + (errors?.length ?? 0);

  return (
    <div className="mb-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">
          Bulk Review Results
        </h3>
        <button
          onClick={onDismiss}
          className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-emerald-700">
            <CheckCircle className="w-4 h-4" />
            {successCount} succeeded
          </span>
          {failCount > 0 && (
            <span className="flex items-center gap-1.5 text-red-700">
              <XCircle className="w-4 h-4" />
              {failCount} failed
            </span>
          )}
        </div>
        {errors?.length > 0 && (
          <ul className="mt-2 space-y-1">
            {errors.map((err, i) => (
              <li
                key={i}
                className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-lg"
              >
                {err.message ?? JSON.stringify(err)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function BulkReviewPage() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [confirmAction, setConfirmAction] = useState(null); // "approve" | "reject"
  const [bulkResults, setBulkResults] = useState(null);

  const limit = 20;

  /* ── Fetch pending docs ── */
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ADMIN_QUERY_KEYS.documents.queue({
      status: "pending",
      page,
      limit,
    }),
    queryFn: () =>
      adminService.getPendingDocuments({ status: "pending", page, limit }),
    placeholderData: keepPreviousData,
  });

  const rawRows = data?.data ?? [];
  const docs = rawRows.flatMap((item) =>
    (item.documents ?? [])
      .filter((doc) => doc.status === "pending")
      .map((doc) => ({
        ...doc,
        userId: item.user,
        businessName: item.businessName ?? item.userInfo?.email ?? "—",
        priority:
          doc.priorityLevel ??
          (item.overallPriorityScore > 55
            ? "HIGH"
            : item.overallPriorityScore > 25
              ? "MEDIUM"
              : "LOW"),
      })),
  );

  const meta = data?.meta ?? {};
  const total = docs.length;
  const totalPages = meta.totalPages ?? (Math.ceil(total / limit) || 1);

  /* ── Selection helpers ── */
  const allSelected =
    docs.length > 0 && docs.every((d) => selected.has(`${d.userId}-${d._id}`));
  const someSelected = docs.some((d) => selected.has(`${d.userId}-${d._id}`));

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(docs.map((d) => `${d.userId}-${d._id}`)));
    }
  }, [allSelected, docs]);

  const toggleOne = useCallback((key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  /* ── Bulk mutation ── */
  const bulkMutation = useMutation({
    mutationFn: (payload) => adminService.bulkReviewDocuments(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: ADMIN_QUERY_KEYS.documents.all,
      });
      setBulkResults({
        results: res?.data?.results ?? [],
        errors: res?.data?.errors ?? [],
      });
      setSelected(new Set());
      setConfirmAction(null);
    },
    onError: (err) => {
      setBulkResults({
        results: [],
        errors: [{ message: err.message ?? "Bulk action failed." }],
      });
      setConfirmAction(null);
    },
  });

  const handleConfirm = useCallback(
    (reason) => {
      const documents = [...selected].map((key) => {
        const [userId, documentId] = key.split("-");
        return { userId, documentId };
      });

      bulkMutation.mutate({
        action: confirmAction,
        documents,
        ...(reason ? { reason } : {}),
      });
    },
    [selected, confirmAction, bulkMutation],
  );

  const selectedCount = selected.size;

  /* ── Render ── */
  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-slate-400" />
              Bulk Review
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Select and process multiple documents at once
            </p>
          </div>
          <div className="flex items-center gap-3">
            {total > 0 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                {total} pending
              </span>
            )}
            <button
              onClick={() => refetch()}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Results */}
        {bulkResults && (
          <ResultsPanel
            results={bulkResults.results}
            errors={bulkResults.errors}
            onDismiss={() => setBulkResults(null)}
          />
        )}

        {/* Action bar — only shown when items selected */}
        {selectedCount > 0 && (
          <div className="flex items-center justify-between mb-4 px-4 py-3 bg-slate-900 rounded-xl text-white">
            <span className="text-sm font-medium">
              {selectedCount} document{selectedCount !== 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-700"
              >
                Clear
              </button>
              <button
                onClick={() => setConfirmAction("reject")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                Reject Selected
              </button>
              <button
                onClick={() => setConfirmAction("approve")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                Approve Selected
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {/* Select-all */}
                  <th className="pl-4 pr-2 py-3 w-10">
                    <button
                      onClick={toggleAll}
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {allSelected ? (
                        <CheckSquare className="w-4 h-4 text-slate-700" />
                      ) : someSelected ? (
                        <MinusSquare className="w-4 h-4 text-slate-500" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  {["Document", "Member", "Uploaded", "Priority"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
                ) : isError ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-slate-500"
                    >
                      <AlertCircle className="w-6 h-6 mx-auto mb-2 text-red-400" />
                      Failed to load document queue.
                    </td>
                  </tr>
                ) : docs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-16 text-center text-slate-400"
                    >
                      <ClipboardList className="w-8 h-8 mx-auto mb-3 opacity-40" />
                      <p className="font-medium text-slate-500">
                        No pending documents
                      </p>
                      <p className="text-xs mt-1">
                        All documents have been reviewed
                      </p>
                    </td>
                  </tr>
                ) : (
                  docs.map((doc) => {
                    const key = `${doc.userId}-${doc._id}`;
                    const isChecked = selected.has(key);
                    const priority = (doc.priority ?? "LOW").toUpperCase();

                    return (
                      <tr
                        key={key}
                        onClick={() => toggleOne(key)}
                        className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors ${
                          isChecked ? "bg-slate-50" : "hover:bg-slate-50/60"
                        }`}
                      >
                        <td
                          className="pl-4 pr-2 py-3.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => toggleOne(key)}
                            className="text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-slate-700" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
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
                          {doc.businessName}
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

      {/* Confirm modal */}
      {confirmAction && (
        <ConfirmModal
          action={confirmAction}
          count={selectedCount}
          isPending={bulkMutation.isPending}
          onClose={() => setConfirmAction(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
