/**
 * @file pages/member/DocumentsPage.jsx
 * @module pages/member
 *
 * KYC document upload page.
 *
 * Allowed document types (must match cloudinaryUploadMiddleware DOCUMENT_FIELDS
 * and memberDto DOCUMENT_TYPES exactly):
 *   nationalId | passport | utilityBill | businessCert | tinCertificate
 *
 * Upload flow:
 *  1. Member selects a document type from the dropdown
 *  2. Member enters a human-readable title (optional — defaults to type label)
 *  3. Member picks a file (PDF, JPG, PNG — MIME validated client-side)
 *  4. POST /api/v1/members/documents (multipart/form-data)
 *     field name = documentType  (e.g. "nationalId")
 *     field name = "title"
 *  5. On success → invalidate MEMBER_QUERY_KEYS.profile to refresh document list
 *
 * The page also shows all previously uploaded documents fetched from the
 * member profile (GET /api/v1/members/me).
 */

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  FilePlus,
  ShieldCheck,
  Paperclip,
  ExternalLink,
} from "lucide-react";
import memberService, {
  MEMBER_QUERY_KEYS,
} from "../../services/member.service.js";
import { formatDate } from "../../utils/formatters.js";
import { cn } from "../../utils/cn.js";

// ─── Constants — must match DOCUMENT_FIELDS in cloudinaryUploadMiddleware.js ──

const DOC_TYPES = [
  { value: "nationalId", label: "National ID" },
  { value: "passport", label: "Passport" },
  { value: "utilityBill", label: "Utility Bill" },
  { value: "businessCert", label: "Business Certificate" },
  { value: "tinCertificate", label: "TIN Certificate" },
];

const DOC_TYPE_MAP = Object.fromEntries(
  DOC_TYPES.map((d) => [d.value, d.label]),
);

const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png,.webp";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

// ─── Animation variants ───────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 },
  }),
};

const reducedFade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0 } },
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-gray-100", className)} />
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

// ─── Field primitives ─────────────────────────────────────────────────────────

function FieldLabel({ htmlFor, children, required }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5"
    >
      {children}
      {required && <span className="text-primary-500 ml-0.5">*</span>}
    </label>
  );
}

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 font-body text-xs text-primary-600 flex items-center gap-1">
      <AlertCircle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

// ─── File drop zone ───────────────────────────────────────────────────────────

function FileDropZone({ file, onFile, onClear, error }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) onFile(dropped);
    },
    [onFile],
  );

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);

  if (file) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl",
          "border border-secondary-200 bg-secondary-50",
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-secondary-100 flex items-center justify-center flex-shrink-0">
            <Paperclip
              className="w-4 h-4 text-secondary-600"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <p className="font-body text-sm font-medium text-gray-900 truncate">
              {file.name}
            </p>
            <p className="font-body text-xs text-gray-400">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove selected file"
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0",
            "text-gray-400 hover:text-gray-700 hover:bg-white transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
          )}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "w-full flex flex-col items-center justify-center gap-3 px-6 py-8 rounded-xl",
          "border-2 border-dashed transition-all duration-200 cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          isDragging
            ? "border-primary-400 bg-primary-50/50"
            : error
              ? "border-primary-200 bg-primary-50/20"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50",
        )}
        aria-label="Upload document — click or drag and drop"
      >
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
            isDragging ? "bg-primary-100" : "bg-gray-100",
          )}
        >
          <Upload
            className={cn(
              "w-5 h-5",
              isDragging ? "text-primary-500" : "text-gray-400",
            )}
            aria-hidden="true"
          />
        </div>
        <div className="text-center">
          <p className="font-body text-sm font-medium text-gray-700">
            Click to upload or drag & drop
          </p>
          <p className="font-body text-xs text-gray-400 mt-0.5">
            PDF, JPG, PNG up to 5 MB
          </p>
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <FieldError message={error} />
    </div>
  );
}

// ─── Upload form ──────────────────────────────────────────────────────────────

function UploadForm({ isApproved }) {
  const queryClient = useQueryClient();

  const [docType, setDocType] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [docTypeError, setDocTypeError] = useState("");

  const uploadMutation = useMutation({
    mutationFn: memberService.uploadDocuments,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBER_QUERY_KEYS.profile });
      toast.success("Document uploaded successfully.");
      setDocType("");
      setTitle("");
      setFile(null);
      setFileError("");
      setDocTypeError("");
    },
    onError: (error) => {
      toast.error(error.message ?? "Upload failed. Please try again.");
    },
  });

  const handleFile = (f) => {
    setFileError("");
    if (!ACCEPTED_MIME.includes(f.type)) {
      setFileError("Only PDF, JPG, and PNG files are accepted.");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setFileError("File must be smaller than 5 MB.");
      return;
    }
    setFile(f);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    let valid = true;

    if (!docType) {
      setDocTypeError("Please select a document type.");
      valid = false;
    } else {
      setDocTypeError("");
    }

    if (!file) {
      setFileError("Please select a file to upload.");
      valid = false;
    }

    if (!valid) return;

    uploadMutation.mutate({
      documentType: docType,
      file,
      title: title.trim() || DOC_TYPE_MAP[docType],
    });
  };

  if (isApproved) {
    return (
      <div className="flex items-start gap-3 px-4 py-4 rounded-xl bg-secondary-50 border border-secondary-200">
        <ShieldCheck
          className="w-4 h-4 text-secondary-500 flex-shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p className="font-body text-sm text-secondary-700 leading-relaxed">
          Your profile has been approved. Document uploads are locked to
          preserve membership integrity.
        </p>
      </div>
    );
  }

  const isUploading = uploadMutation.isPending;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Document type */}
      <div>
        <FieldLabel htmlFor="docType" required>
          Document Type
        </FieldLabel>
        <select
          id="docType"
          value={docType}
          onChange={(e) => {
            setDocType(e.target.value);
            setDocTypeError("");
          }}
          disabled={isUploading}
          className={cn(
            "w-full px-3 py-2.5 rounded-lg border font-body text-sm text-gray-900 bg-white",
            "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
            "transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
            docTypeError
              ? "border-primary-300"
              : "border-gray-200 hover:border-gray-300",
          )}
        >
          <option value="">Select document type…</option>
          {DOC_TYPES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <FieldError message={docTypeError} />
      </div>

      {/* Optional title override */}
      <div>
        <FieldLabel htmlFor="docTitle">Label (optional)</FieldLabel>
        <input
          id="docTitle"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isUploading}
          placeholder={
            docType ? DOC_TYPE_MAP[docType] : "Defaults to document type name"
          }
          maxLength={100}
          className={cn(
            "w-full px-3 py-2.5 rounded-lg border font-body text-sm text-gray-900",
            "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
            "transition-colors duration-150 border-gray-200 hover:border-gray-300",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        />
        <p className="mt-1 font-body text-xs text-gray-400">
          A short label helps identify this document later.
        </p>
      </div>

      {/* File drop zone */}
      <div>
        <FieldLabel required>File</FieldLabel>
        <FileDropZone
          file={file}
          onFile={handleFile}
          onClear={() => {
            setFile(null);
            setFileError("");
          }}
          error={fileError}
        />
      </div>

      <button
        type="submit"
        disabled={isUploading}
        className={cn(
          "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg",
          "font-body text-sm font-medium transition-all duration-150 shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          isUploading
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-gray-900 text-white hover:bg-gray-800",
        )}
      >
        {isUploading ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
            Uploading…
          </>
        ) : (
          <>
            <FilePlus className="w-4 h-4" aria-hidden="true" />
            Upload Document
          </>
        )}
      </button>
    </form>
  );
}

// ─── Document list ────────────────────────────────────────────────────────────

function DocumentList({ documents }) {
  if (!documents?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center">
          <FileText className="w-6 h-6 text-gray-300" aria-hidden="true" />
        </div>
        <p className="font-body text-sm text-gray-400">
          No documents uploaded yet.
        </p>
      </div>
    );
  }

  return (
    <ul
      className="divide-y divide-gray-50"
      role="list"
      aria-label="Uploaded documents"
    >
      {documents.map((doc) => (
        <li
          key={doc._id ?? doc.publicId ?? doc.url}
          className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-gray-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-body text-sm font-medium text-gray-900 truncate">
                {doc.title ||
                  DOC_TYPE_MAP[doc.documentType] ||
                  doc.documentType}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-body text-xs text-gray-400">
                  {DOC_TYPE_MAP[doc.documentType] ?? doc.documentType}
                </span>
                {doc.uploadedAt && (
                  <>
                    <span className="text-gray-200 text-xs" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-body text-xs text-gray-400">
                      {formatDate(doc.uploadedAt)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {doc.verified && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-50 border border-secondary-200"
                aria-label="Document verified"
              >
                <CheckCircle2
                  className="w-3 h-3 text-secondary-500"
                  aria-hidden="true"
                />
                <span className="font-body text-xs text-secondary-600 font-medium">
                  Verified
                </span>
              </span>
            )}
            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View ${doc.title || doc.documentType}`}
                className={cn(
                  "w-8 h-8 flex items-center justify-center rounded-lg",
                  "text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                )}
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
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
          Failed to load documents
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

export default function DocumentsPage() {
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedFade : fadeUp;

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

  const profile = profileData?.data ?? profileData ?? null;
  const documents = profile?.documents ?? [];
  const isApproved = profile?.isApproved ?? false;

  if (isLoading) return <PageSkeleton />;

  // 404 = member has no profile yet — show the page with empty state, not an error
  // Any other error = real failure worth surfacing
  if (isError) {
    const status = error?.status ?? error?.response?.status;
    if (status !== 404) return <ErrorState onRetry={refetch} />;
    // 404: fall through — profile/documents will both be empty, page renders fine
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        visible: {
          transition: { staggerChildren: prefersReducedMotion ? 0 : 0.05 },
        },
      }}
      className="space-y-6 max-w-2xl mx-auto"
    >
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <motion.div variants={variants} custom={0}>
        <h1 className="font-display font-bold text-gray-900 text-2xl sm:text-3xl">
          Documents
        </h1>
        <p className="font-body text-gray-400 text-sm mt-1">
          Upload KYC documents required for TAM membership verification.
        </p>
      </motion.div>

      {/* ── Upload section ────────────────────────────────────────────────── */}
      <motion.div
        variants={variants}
        custom={1}
        className="bg-white rounded-xl border border-gray-100 overflow-hidden"
      >
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-50 bg-gray-50/50">
          <Upload
            className="w-4 h-4 text-gray-400 flex-shrink-0"
            aria-hidden="true"
          />
          <h2 className="font-display font-bold text-gray-900 text-sm">
            Upload New Document
          </h2>
        </div>
        <div className="px-6 py-5">
          <UploadForm isApproved={isApproved} />
        </div>
      </motion.div>

      {/* ── Uploaded documents ────────────────────────────────────────────── */}
      <motion.div
        variants={variants}
        custom={2}
        className="bg-white rounded-xl border border-gray-100 overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-50 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <FileText
              className="w-4 h-4 text-gray-400 flex-shrink-0"
              aria-hidden="true"
            />
            <h2 className="font-display font-bold text-gray-900 text-sm">
              Uploaded Documents
            </h2>
          </div>
          <span className="font-body text-xs text-gray-400 font-medium">
            {documents.length} file{documents.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="px-6 py-5">
          <DocumentList documents={documents} />
        </div>
      </motion.div>

      {/* ── Guidance note ─────────────────────────────────────────────────── */}
      <motion.div
        variants={variants}
        custom={3}
        className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-gray-50 border border-gray-100"
        role="note"
      >
        <ShieldCheck
          className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p className="font-body text-xs text-gray-500 leading-relaxed">
          Documents are stored securely and used solely for TAM membership
          verification. Accepted types: PDF, JPG, PNG (max 5 MB each).
        </p>
      </motion.div>
    </motion.div>
  );
}
