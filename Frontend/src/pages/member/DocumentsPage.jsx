/**
 * @file DocumentsPage.jsx
 * @module pages/member
 *
 * KYC document management page for authenticated members.
 *
 * Sections:
 *   1. Constants & config
 *   2. Sub-components (DocumentCard, UploadZone, UploadModal)
 *   3. DocumentsPage (root)
 *
 * Data flow:
 *   - useCurrentUser  → auth identity
 *   - useQuery        → profile (documents embedded in profile object)
 *   - useMutation     → documentService.uploadDocuments
 *   - queryClient.invalidateQueries → MEMBER_QUERY_KEYS + DOCUMENT_QUERY_KEYS
 *
 * Business rules enforced in UI:
 *   - Approved members cannot upload new documents (backend also enforces 403)
 *   - Each document type can only be uploaded once; re-upload replaces existing
 *   - Files must be image/* or application/pdf, max 5 MB
 *   - At least one file must be selected before the upload button enables
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  FileBadge,
  ShieldCheck,
  Ban,
  X,
  Loader2,
  Info,
  CloudUpload,
} from "lucide-react";

import memberService, {
  MEMBER_QUERY_KEYS,
} from "../../services/member.service.js";
import documentService, {
  DOCUMENT_QUERY_KEYS,
  validateUploadFile,
} from "../../services/document.service.js";
import {
  formatDate,
  formatRelativeTime,
  DOCUMENT_TYPE_LABELS,
  STATUS_CONFIG,
  ACCOUNT_STATUS_CONFIG,
} from "../../utils/formatters.js";

/* ─────────────────────────────────────────────────────────────────────────────
   1. CONSTANTS & CONFIG
───────────────────────────────────────────────────────────────────────────── */

/** Ordered list — drives the card grid and upload checklist. */
const DOCUMENT_TYPES = [
  "nationalId",
  "passport",
  "utilityBill",
  "businessCert",
  "tinCertificate",
];

/**
 * Per-document-type metadata: description and what the member should upload.
 * Keeps the UI copy co-located with the constants it describes.
 */
const DOC_META = {
  nationalId: {
    description:
      "Government-issued national identity card (front & back scan).",
    icon: FileBadge,
  },
  passport: {
    description: "Valid passport biographical data page.",
    icon: FileBadge,
  },
  utilityBill: {
    description: "Utility bill or bank statement dated within 3 months.",
    icon: FileText,
  },
  businessCert: {
    description: "Certificate of incorporation or business registration.",
    icon: ShieldCheck,
  },
  tinCertificate: {
    description: "Tax Identification Number certificate issued by MRA.",
    icon: FileBadge,
  },
};

/** Status icon map — separate from STATUS_CONFIG colour strings. */
const STATUS_ICON = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  expired: AlertTriangle,
};

/* ─────────────────────────────────────────────────────────────────────────────
   2A. DocumentCard
   Renders one document type slot: either uploaded (with status) or empty.
───────────────────────────────────────────────────────────────────────────── */

/**
 * @param {{
 *   docType: string,
 *   document: object | null,
 *   isLocked: boolean,
 *   onUploadClick: (docType: string) => void,
 * }} props
 */
function DocumentCard({ docType, document, isLocked, onUploadClick }) {
  const label = DOCUMENT_TYPE_LABELS[docType] ?? docType;
  const meta = DOC_META[docType];
  const Icon = meta?.icon ?? FileText;

  const uploaded = !!document;
  const status = document?.status ?? null;
  const cfg = status ? STATUS_CONFIG[status] : null;
  const StatusIcon = status ? (STATUS_ICON[status] ?? Clock) : null;

  return (
    <div
      className={[
        "relative flex flex-col gap-4 rounded-lg border bg-white p-5",
        "transition-shadow duration-200",
        uploaded
          ? "border-gray-200 shadow-sm"
          : "border-dashed border-gray-300",
        !uploaded && !isLocked
          ? "hover:border-tam-red hover:shadow-md cursor-pointer"
          : "",
      ].join(" ")}
      onClick={
        !uploaded && !isLocked ? () => onUploadClick(docType) : undefined
      }
      role={!uploaded && !isLocked ? "button" : undefined}
      tabIndex={!uploaded && !isLocked ? 0 : undefined}
      onKeyDown={
        !uploaded && !isLocked
          ? (e) => e.key === "Enter" && onUploadClick(docType)
          : undefined
      }
      aria-label={!uploaded && !isLocked ? `Upload ${label}` : undefined}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-50 border border-gray-200">
            <Icon size={18} className="text-gray-500" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-800 leading-tight">
              {label}
            </p>
            {uploaded && document.uploadedAt && (
              <p className="text-xs text-gray-400 mt-0.5">
                Uploaded {formatRelativeTime(document.uploadedAt)}
              </p>
            )}
          </div>
        </div>

        {/* Status badge */}
        {cfg && StatusIcon && (
          <span
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              cfg.color,
            ].join(" ")}
          >
            <StatusIcon size={11} />
            {cfg.label}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed">
        {meta?.description}
      </p>

      {/* Rejection reason */}
      {status === "rejected" && document?.rejectionReason && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="text-xs font-medium text-red-700 mb-0.5">
            Rejection reason
          </p>
          <p className="text-xs text-red-600 leading-relaxed">
            {document.rejectionReason}
          </p>
        </div>
      )}

      {/* CTA */}
      <div className="mt-auto pt-1">
        {isLocked ? (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Ban size={12} />
            <span>Locked after approval</span>
          </div>
        ) : uploaded ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUploadClick(docType);
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-tam-red hover:text-tam-red/80 transition-colors"
          >
            <RefreshCw size={12} />
            Replace document
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-medium text-tam-red">
            <Upload size={12} />
            Click to upload
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   2B. UploadZone
   Drag-and-drop file picker for a single document type.
───────────────────────────────────────────────────────────────────────────── */

/**
 * @param {{
 *   docType: string,
 *   file: File | null,
 *   onFile: (file: File | null) => void,
 *   error: string | null,
 * }} props
 */
function UploadZone({ docType, file, onFile, error }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const label = DOCUMENT_TYPE_LABELS[docType] ?? docType;

  const handleFiles = useCallback(
    (files) => {
      const f = files[0];
      if (!f) return;
      try {
        validateUploadFile(docType, f);
        onFile(f, null);
      } catch (err) {
        // validateUploadFile throws with a user-safe message string.
        // Surface it via onFile(null, message) so the parent stores the error
        // and UploadZone renders it below the drop target.
        onFile(null, err.message);
      }
    },
    [docType, onFile],
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {label}
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          "relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed",
          "cursor-pointer transition-all duration-200 py-8 px-4 text-center",
          dragging
            ? "border-tam-red bg-red-50"
            : file
              ? "border-emerald-400 bg-emerald-50"
              : error
                ? "border-red-400 bg-red-50"
                : "border-gray-300 bg-gray-50 hover:border-tam-red hover:bg-red-50/30",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_MIME.join(",")}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {file ? (
          <>
            <CheckCircle2 size={24} className="text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-emerald-700 truncate max-w-[200px]">
                {file.name}
              </p>
              <p className="text-xs text-emerald-600">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFile(null, null);
              }}
              className="absolute top-2 right-2 p-1 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-500 transition-colors"
              aria-label="Remove file"
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <>
            <CloudUpload
              size={24}
              className={error ? "text-red-400" : "text-gray-400"}
            />
            <div>
              <p className="text-sm font-medium text-gray-600">
                Drop file here or <span className="text-tam-red">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                JPEG, PNG, WebP, PDF · max 5 MB
              </p>
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle size={11} />
          {error}
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   2C. UploadModal
   Slide-up sheet for selecting and uploading a document file.
───────────────────────────────────────────────────────────────────────────── */

/**
 * @param {{
 *   docType: string | null,
 *   onClose: () => void,
 *   onSuccess: () => void,
 * }} props
 */
function UploadModal({ docType, onClose, onSuccess }) {
  const prefersReducedMotion = useReducedMotion();
  const queryClient = useQueryClient();

  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [progress, setProgress] = useState(0);

  const label = docType ? (DOCUMENT_TYPE_LABELS[docType] ?? docType) : "";

  const {
    mutate: upload,
    isPending,
    error: uploadError,
    reset,
  } = useMutation({
    mutationFn: () =>
      documentService.uploadDocuments({ [docType]: file }, (pct) =>
        setProgress(pct),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBER_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: DOCUMENT_QUERY_KEYS.all });
      onSuccess();
    },
  });

  // Reset state each time the modal opens for a new docType
  useEffect(() => {
    setFile(null);
    setFileError(null);
    setProgress(0);
    reset();
  }, [docType, reset]);

  const handleFile = useCallback(
    (f, err) => {
      setFile(f);
      setFileError(err ?? null);
      reset();
    },
    [reset],
  );

  const handleSubmit = () => {
    if (!file || fileError) return;
    upload();
  };

  const slideVariants = prefersReducedMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        hidden: { opacity: 0, y: 40 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { type: "spring", damping: 26, stiffness: 320 },
        },
        exit: { opacity: 0, y: 40, transition: { duration: 0.18 } },
      };

  if (!docType) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={!isPending ? onClose : undefined}
      />

      {/* Sheet */}
      <motion.div
        className="relative z-10 w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden"
        variants={slideVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2
              id="upload-modal-title"
              className="text-sm font-semibold text-gray-800"
            >
              Upload — {label}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Replaces any previously uploaded file for this document type.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <UploadZone
            docType={docType}
            file={file}
            onFile={handleFile}
            error={fileError}
          />

          {/* Upload progress */}
          {isPending && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <motion.div
                  className="h-full bg-tam-red rounded-full"
                  style={{ width: `${progress}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            </div>
          )}

          {/* API error */}
          {uploadError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
              <AlertTriangle
                size={14}
                className="text-red-500 mt-0.5 shrink-0"
              />
              <p className="text-xs text-red-700">
                {uploadError?.response?.data?.message ??
                  "Upload failed. Please try again."}
              </p>
            </div>
          )}

          {/* Info note */}
          <div className="flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2.5">
            <Info size={13} className="text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              Documents are reviewed by the TAM compliance team. You will be
              notified once your document status changes.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!file || !!fileError || isPending}
            className={[
              "flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white",
              "bg-tam-red hover:bg-tam-red/90 transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            ].join(" ")}
          >
            {isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload size={14} />
                Upload Document
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. DocumentsPage
───────────────────────────────────────────────────────────────────────────── */

/** Framer Motion variants — stagger container */
const containerVariants = (reduced) => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: reduced ? 0 : 0.07 },
  },
});

/** Framer Motion variants — individual card */
const cardVariants = (reduced) => ({
  hidden: { opacity: 0, y: reduced ? 0 : 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: reduced ? 0 : 0.35, ease: "easeOut" },
  },
});

export default function DocumentsPage() {
  const prefersReducedMotion = useReducedMotion();
  const [activeDocType, setActiveDocType] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  /* ── Data ─────────────────────────────────────────────────────────────── */
  const {
    data: rawProfile,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: MEMBER_QUERY_KEYS.profile(),
    queryFn: memberService.getMyProfile,
    staleTime: 5 * 60 * 1000,
    retry: (count, err) => err?.response?.status !== 404 && count < 2,
  });

  // Normalise envelope — backend wraps in { data: profile } via ApiResponse
  const profile = rawProfile?.data ?? rawProfile ?? null;
  const documents = profile?.documents ?? [];
  const isLocked = !!profile?.isApproved;

  /** Map documentType → document object for O(1) lookup in card grid. */
  const docMap = Object.fromEntries(documents.map((d) => [d.documentType, d]));

  /* ── Stats ────────────────────────────────────────────────────────────── */
  const totalDocs = documents.length;
  const approvedDocs = documents.filter((d) => d.status === "approved").length;
  const pendingDocs = documents.filter((d) => d.status === "pending").length;
  const rejectedDocs = documents.filter((d) => d.status === "rejected").length;

  /* ── Upload handlers ──────────────────────────────────────────────────── */
  const handleUploadClick = useCallback((docType) => {
    setActiveDocType(docType);
    setModalVisible(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleUploadSuccess = useCallback(() => {
    setModalVisible(false);
  }, []);

  /* ── Render states ────────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        {/* Page header skeleton */}
        <div className="h-8 w-48 rounded-md bg-gray-200 animate-pulse" />
        {/* Stats row skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-lg bg-gray-100 animate-pulse"
            />
          ))}
        </div>
        {/* Cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-44 rounded-lg bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    const is404 = error?.response?.status === 404;
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        {is404 ? (
          <>
            <FileText size={36} className="text-gray-300 mb-4" />
            <h2 className="text-base font-semibold text-gray-700 mb-1">
              No profile found
            </h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm">
              You need to create your profile before you can upload documents.
            </p>
            <Link
              to="/member/profile"
              className="inline-flex items-center gap-2 rounded-lg bg-tam-red px-5 py-2.5 text-sm font-semibold text-white hover:bg-tam-red/90 transition-colors"
            >
              Create Profile
              <ChevronRight size={15} />
            </Link>
          </>
        ) : (
          <>
            <AlertTriangle size={36} className="text-red-300 mb-4" />
            <h2 className="text-base font-semibold text-gray-700 mb-1">
              Failed to load documents
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {error?.response?.data?.message ??
                "Something went wrong. Please try again."}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <RefreshCw size={14} />
              Retry
            </button>
          </>
        )}
      </div>
    );
  }

  /* ── Main render ──────────────────────────────────────────────────────── */
  return (
    <>
      <motion.div
        className="flex flex-col gap-6 p-6"
        variants={containerVariants(prefersReducedMotion)}
        initial="hidden"
        animate="visible"
      >
        {/* ── Page header ─────────────────────────────────────────────── */}
        <motion.div
          variants={cardVariants(prefersReducedMotion)}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              KYC Documents
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Upload and manage your compliance documents for TAM review.
            </p>
          </div>

          {isLocked && (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 self-start sm:self-auto">
              <ShieldCheck size={13} />
              Profile approved — documents locked
            </div>
          )}
        </motion.div>

        {/* ── Approval lock notice ─────────────────────────────────────── */}
        {isLocked && (
          <motion.div
            variants={cardVariants(prefersReducedMotion)}
            className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3"
          >
            <ShieldCheck
              size={16}
              className="text-emerald-600 mt-0.5 shrink-0"
            />
            <div>
              <p className="text-sm font-medium text-emerald-800">
                Your documents are locked
              </p>
              <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">
                Once a profile is approved, documents cannot be replaced.
                Contact TAM support if an amendment is required.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Stats row ───────────────────────────────────────────────── */}
        <motion.div
          variants={cardVariants(prefersReducedMotion)}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          {[
            {
              label: "Total uploaded",
              value: totalDocs,
              colour: "text-gray-800",
            },
            {
              label: "Approved",
              value: approvedDocs,
              colour: "text-emerald-600",
            },
            {
              label: "Pending review",
              value: pendingDocs,
              colour: "text-amber-600",
            },
            { label: "Rejected", value: rejectedDocs, colour: "text-red-600" },
          ].map(({ label, value, colour }) => (
            <div
              key={label}
              className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm"
            >
              <p className={`text-2xl font-bold ${colour}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* ── Document card grid ──────────────────────────────────────── */}
        <motion.div
          variants={cardVariants(prefersReducedMotion)}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {DOCUMENT_TYPES.map((docType) => (
            <DocumentCard
              key={docType}
              docType={docType}
              document={docMap[docType] ?? null}
              isLocked={isLocked}
              onUploadClick={handleUploadClick}
            />
          ))}
        </motion.div>

        {/* ── Submission CTA ──────────────────────────────────────────── */}
        {!isLocked && totalDocs > 0 && (
          <motion.div
            variants={cardVariants(prefersReducedMotion)}
            className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-5 py-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-50 border border-gray-200">
                <ShieldCheck size={17} className="text-gray-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Ready to submit for review?
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Once your profile is complete, submit it for TAM compliance
                  review.
                </p>
              </div>
            </div>
            <Link
              to="/member/profile"
              className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-tam-red px-4 py-2 text-sm font-semibold text-white hover:bg-tam-red/90 transition-colors"
            >
              Go to Profile
              <ChevronRight size={14} />
            </Link>
          </motion.div>
        )}

        {/* ── Empty state — no documents yet ──────────────────────────── */}
        {totalDocs === 0 && !isLocked && (
          <motion.div
            variants={cardVariants(prefersReducedMotion)}
            className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 px-6 text-center"
          >
            <FileText size={32} className="text-gray-300 mb-3" />
            <p className="text-sm font-semibold text-gray-600 mb-1">
              No documents uploaded yet
            </p>
            <p className="text-xs text-gray-400 max-w-xs">
              Click any document card above to upload your KYC files and begin
              the review process.
            </p>
          </motion.div>
        )}
      </motion.div>

      {/* ── Upload modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {modalVisible && (
          <UploadModal
            key="upload-modal"
            docType={activeDocType}
            onClose={handleModalClose}
            onSuccess={handleUploadSuccess}
          />
        )}
      </AnimatePresence>
    </>
  );
}
