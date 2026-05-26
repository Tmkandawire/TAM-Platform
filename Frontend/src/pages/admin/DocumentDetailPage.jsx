/**
 * @file pages/admin/DocumentDetailPage.jsx
 * @module pages/admin
 *
 * Single document detail view — preview link, member context, full action set.
 *
 * Actions:
 *  - Approve  → PATCH /admin/documents/:userId/:docId/approve
 *  - Reject   → PATCH /admin/documents/:userId/:docId/reject (requires reason)
 *  - Request Resubmission → PATCH /admin/documents/:userId/:docId/request-resubmission
 *                           (requires reason + documentsRequired[])
 *
 * Data:
 *  We fetch the full document queue and find the matching document by
 *  userId + docId from route params, since no dedicated single-doc GET
 *  endpoint exists. Member profile data is embedded in queue items.
 */

import { useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  ExternalLink,
  CheckCircle,
  XCircle,
  RefreshCcw,
  AlertCircle,
  Loader2,
  Calendar,
  Clock,
  Building2,
  Mail,
  Shield,
  Info,
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

const ALL_DOC_TYPES = [
  { value: "nationalId", label: "National ID" },
  { value: "passport", label: "Passport" },
  { value: "utilityBill", label: "Utility Bill" },
  { value: "businessCert", label: "Business Certificate" },
  { value: "tinCertificate", label: "TIN Certificate" },
];

const STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  resubmission_required: "bg-orange-100 text-orange-800 border-orange-200",
  expired: "bg-slate-100 text-slate-600 border-slate-200",
};

/* ─── helpers ────────────────────────────────────────────────────────────── */

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/* ─── Resubmission modal ─────────────────────────────────────────────────── */

function ResubmissionModal({ onConfirm, onClose, isPending }) {
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState([]);

  const toggleType = (val) =>
    setSelected((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val],
    );

  const isValid = reason.trim().length >= 10 && selected.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
            <RefreshCcw className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Request Resubmission
            </h2>
            <p className="text-sm text-slate-500">
              Member will be asked to re-upload documents
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Explain why resubmission is needed. Min 10 characters."
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 resize-none transition-all"
          />
          <p className="text-xs text-slate-400 mt-1">
            {reason.trim().length} / 500
          </p>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Documents required <span className="text-red-500">*</span>
          </label>
          <div className="space-y-1.5">
            {ALL_DOC_TYPES.map((t) => (
              <label
                key={t.value}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(t.value)}
                  onChange={() => toggleType(t.value)}
                  className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500/30"
                />
                <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                  {t.label}
                </span>
              </label>
            ))}
          </div>
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
            onClick={() => onConfirm(reason.trim(), selected)}
            disabled={!isValid || isPending}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Request
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Reject modal ───────────────────────────────────────────────────────── */

function RejectModal({ onConfirm, onClose, isPending }) {
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
          <h2 className="text-base font-semibold text-slate-900">
            Reject Document
          </h2>
        </div>
        <div className="mb-5">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Explain why the document is rejected. Min 10 characters."
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

/* ─── Info row ───────────────────────────────────────────────────────────── */

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm text-slate-800 font-medium">{value ?? "—"}</p>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function DocumentDetailPage() {
  const { userId, docId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [modal, setModal] = useState(null); // "approve" | "reject" | "resubmit"
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  /* ── Data: fetch queue, find this doc ── */
  const { data, isLoading, isError } = useQuery({
    queryKey: ADMIN_QUERY_KEYS.documents.detail(userId, docId),
    enabled: !actionSuccess,
    queryFn: async () => {
      const res = await adminService.getPendingDocuments({ limit: 100 });
      const rawRows = res?.data ?? [];

      // Flatten documents with user context for easy lookup
      const allDocs = rawRows.flatMap((item) =>
        (item.documents ?? []).map((doc) => ({
          ...doc,
          userId: item.user?.toString?.() ?? item.user,
          businessName: item.businessName ?? item.userInfo?.email ?? "—",
          contactPerson: item.contactPerson ?? "—",
          contactEmail: item.userInfo?.email ?? "—",
          membershipType: item.membershipType,
          userInfo: item.userInfo,
        })),
      );

      const found = allDocs.find(
        (d) => d.userId?.toString() === userId && d._id?.toString() === docId,
      );

      if (!found) throw new Error("Document not found");
      return found;
    },
  });

  const item = data;
  const doc = data ?? null;

  /* ── Approve ── */
  const approveMutation = useMutation({
    mutationFn: () => adminService.approveDocument(userId, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ADMIN_QUERY_KEYS.documents.all,
      });
      setModal(null);
      setActionSuccess("Document approved successfully.");
      setActionError(null);
      setTimeout(() => navigate("/admin/documents"), 1500);
    },
    onError: (err) => setActionError(err.message ?? "Approval failed."),
  });

  /* ── Reject ── */
  const rejectMutation = useMutation({
    mutationFn: (reason) => adminService.rejectDocument(userId, docId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ADMIN_QUERY_KEYS.documents.all,
      });
      setModal(null);
      setActionSuccess("Document rejected.");
      setActionError(null);
      setTimeout(() => navigate("/admin/documents"), 1500);
    },
    onError: (err) => setActionError(err.message ?? "Rejection failed."),
  });

  /* ── Resubmission ── */
  const resubmitMutation = useMutation({
    mutationFn: ({ reason, documentsRequired }) =>
      adminService.requestResubmission(
        userId,
        docId,
        reason,
        documentsRequired,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ADMIN_QUERY_KEYS.documents.all,
      });
      setModal(null);
      setActionSuccess("Resubmission requested.");
      setActionError(null);
      setTimeout(() => navigate("/admin/documents"), 1500);
    },
    onError: (err) => setActionError(err.message ?? "Request failed."),
  });

  const isPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    resubmitMutation.isPending;

  const handleConfirm = useCallback(
    (reasonOrArgs, documentsRequired) => {
      if (modal === "approve") approveMutation.mutate();
      if (modal === "reject") rejectMutation.mutate(reasonOrArgs);
      if (modal === "resubmit")
        resubmitMutation.mutate({
          reason: reasonOrArgs,
          documentsRequired,
        });
    },
    [modal],
  );

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  /* ── Error ── */
  if (isError || !item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-slate-600">Document not found.</p>
        <Link
          to="/admin/documents"
          className="text-sm text-slate-500 underline underline-offset-2"
        >
          Back to document queue
        </Link>
      </div>
    );
  }

  const status = doc?.status ?? "pending";
  const canAct = status === "pending" || status === "resubmission_required";

  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/admin/documents")}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-semibold text-slate-900">
                {DOC_TYPE_LABELS[doc?.documentType] ?? doc?.documentType}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Document Detail</p>
            </div>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${STATUS_STYLES[status] ?? STATUS_STYLES.pending}`}
          >
            {status.replace("_", " ")}
          </span>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        {/* Alerts */}
        {actionError && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {actionError}
          </div>
        )}
        {actionSuccess && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {actionSuccess}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Document info */}
          <div className="lg:col-span-2 space-y-5">
            {/* Document metadata */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Document Details
              </h2>
              <InfoRow
                icon={FileText}
                label="Document Type"
                value={DOC_TYPE_LABELS[doc?.documentType] ?? doc?.documentType}
              />
              <InfoRow
                icon={Clock}
                label="Uploaded"
                value={formatDate(doc?.uploadedAt ?? doc?.createdAt)}
              />
              {doc?.expiryDate && (
                <InfoRow
                  icon={Calendar}
                  label="Expiry Date"
                  value={formatDate(doc.expiryDate)}
                />
              )}
              {doc?.issueDate && (
                <InfoRow
                  icon={Calendar}
                  label="Issue Date"
                  value={formatDate(doc.issueDate)}
                />
              )}
              {doc?.rejectionReason && (
                <InfoRow
                  icon={Info}
                  label="Previous Rejection Reason"
                  value={doc.rejectionReason}
                />
              )}

              {/* Preview link */}
              {doc?.url ? (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <a
                    href={
                      doc.url?.includes("/raw/upload/")
                        ? doc.url.replace(
                            "/raw/upload/",
                            "/raw/upload/fl_attachment/",
                          )
                        : doc.url
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Document (Cloudinary)
                  </a>
                </div>
              ) : (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-sm text-slate-400 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    No preview URL available for this document.
                  </p>
                </div>
              )}
            </div>

            {/* Member context */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                Member Context
              </h2>
              <InfoRow
                icon={Building2}
                label="Business Name"
                value={item.businessName}
              />
              <InfoRow
                icon={Mail}
                label="Contact Email"
                value={item.contactEmail ?? item.email}
              />
              <InfoRow
                icon={Shield}
                label="Contact Person"
                value={item.contactPerson ?? "—"}
              />
              <div className="mt-3 pt-3 border-t border-slate-100">
                <Link
                  to={`/admin/members/${userId}`}
                  className="text-sm text-slate-500 hover:text-slate-800 underline underline-offset-2 transition-colors"
                >
                  View full member profile →
                </Link>
              </div>
            </div>
          </div>

          {/* Right: Action sidebar */}
          <div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sticky top-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">
                Review Actions
              </h2>

              {canAct ? (
                <div className="space-y-2.5">
                  <button
                    onClick={() => setModal("approve")}
                    disabled={isPending}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => setModal("resubmit")}
                    disabled={isPending}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    Request Resubmission
                  </button>
                  <button
                    onClick={() => setModal("reject")}
                    disabled={isPending}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="text-xs text-slate-400">
                    No actions available. Document status is{" "}
                    <span className="font-medium capitalize">
                      {status.replace("_", " ")}
                    </span>
                    .
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal === "approve" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setModal(null)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">
                Approve Document
              </h2>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              This document will be marked as approved. The member will be
              notified.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setModal(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirm()}
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

      {modal === "reject" && (
        <RejectModal
          isPending={rejectMutation.isPending}
          onClose={() => setModal(null)}
          onConfirm={(reason) => handleConfirm(reason)}
        />
      )}

      {modal === "resubmit" && (
        <ResubmissionModal
          isPending={resubmitMutation.isPending}
          onClose={() => setModal(null)}
          onConfirm={(reason, docs) => handleConfirm(reason, docs)}
        />
      )}
    </div>
  );
}
