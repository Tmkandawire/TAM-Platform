/**
 * @file document.service.js
 * @module services/document
 *
 * Frontend transport layer for all KYC document operations.
 *
 * Sections:
 *   1. Query key factory
 *   2. Upload helper
 *   3. Service methods
 */

import api from "../utils/api.js";

/* ─────────────────────────────────────────────────────────────────────────────
   1. QUERY KEY FACTORY
   Centralised so every hook and page that touches document data imports from
   one place. queryClient.invalidateQueries({ queryKey: DOCUMENT_QUERY_KEYS.all })
   after any mutation hits the entire document cache correctly.
───────────────────────────────────────────────────────────────────────────── */
export const DOCUMENT_QUERY_KEYS = {
  /** Invalidates everything document-related. */
  all: ["documents"],

  /** The member's own document list (embedded in profile). */
  mine: () => [...DOCUMENT_QUERY_KEYS.all, "mine"],
};

/* ─────────────────────────────────────────────────────────────────────────────
   2. UPLOAD HELPERS
───────────────────────────────────────────────────────────────────────────── */

/**
 * Allowed MIME types — mirrors the backend multer fileFilter config so
 * invalid files are rejected before a byte hits the network.
 */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/** 5 MB — mirrors the backend multer limits.fileSize value. */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Allowed KYC document type keys — mirrors the backend DOCUMENT_TYPES enum
 * in the document DTO so unknown keys are caught before the request is built.
 */
const ALLOWED_DOCUMENT_TYPES = new Set([
  "nationalId",
  "passport",
  "utilityBill",
  "businessCert",
  "tinCertificate",
]);

/**
 * Validates a single File against KYC upload constraints.
 *
 * Exported so UI components (UploadZone) can call the same rules for
 * immediate feedback without duplicating constants. The service also calls
 * this inside uploadDocuments as the authoritative boundary check — so
 * validation applies regardless of which code path triggers the upload.
 *
 * @param {string} documentType  - The document type key (e.g. "nationalId").
 * @param {File}   file          - The File object to validate.
 * @throws {Error} with a user-safe message if validation fails.
 */
export function validateUploadFile(documentType, file) {
  if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    throw new Error(`Unknown document type: "${documentType}".`);
  }
  if (!(file instanceof File)) {
    throw new Error(
      `Expected a File for "${documentType}", received ${typeof file}.`,
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(
      `"${file.name}" is not an accepted file type. Upload a JPEG, PNG, WebP, or PDF.`,
    );
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `"${file.name}" exceeds the 5 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
    );
  }
  if (file.size === 0) {
    throw new Error(`"${file.name}" is empty and cannot be uploaded.`);
  }
}

/**
 * Converts a { [documentType]: File } map into a FormData object.
 * Each entry becomes a field named by its document type key — matching the
 * multer field configuration on the backend.
 *
 * @param {Record<string, File>} fileMap
 * @returns {FormData}
 */
function buildFormData(fileMap) {
  const form = new FormData();
  Object.entries(fileMap).forEach(([documentType, file]) => {
    form.append(documentType, file, file.name);
  });
  return form;
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. SERVICE METHODS
───────────────────────────────────────────────────────────────────────────── */

const documentService = {
  /**
   * Upload one or more KYC documents.
   *
   * Validates every file in fileMap against MIME type, size, and document
   * type constraints before building the multipart payload. Throws with a
   * user-safe message if any file fails — the mutation's onError handler
   * can surface this directly without additional mapping.
   *
   * @route  POST /api/v1/documents/upload
   * @access Private — member only
   *
   * @param {Record<string, File>} fileMap
   *   e.g. { nationalId: File, passport: File }
   * @param {(progressPct: number) => void} [onProgress]
   *   Optional upload progress callback. Receives 0–100.
   * @returns {Promise<import('../types').Profile>}
   *   The updated profile object with the new document statuses embedded.
   */
  async uploadDocuments(fileMap, onProgress) {
    // Validate every entry before touching the network.
    // Fail fast on the first invalid file — no partial uploads.
    Object.entries(fileMap).forEach(([documentType, file]) =>
      validateUploadFile(documentType, file),
    );

    const form = buildFormData(fileMap);

    const { data } = await api.post("/documents/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: onProgress
        ? (evt) => {
            const pct = evt.total
              ? Math.round((evt.loaded * 100) / evt.total)
              : 0;
            onProgress(pct);
          }
        : undefined,
    });

    // Normalise envelope: backend wraps in { data: profile } via ApiResponse
    return data?.data ?? data;
  },
};

export default documentService;
