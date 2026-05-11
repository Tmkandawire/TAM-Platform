import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";

/**
 * Formats an ISO date string to a readable date.
 * e.g. "15 Jan 2025"
 */
export function formatDate(dateString) {
  if (!dateString) return "—";
  const date =
    typeof dateString === "string" ? parseISO(dateString) : dateString;
  if (!isValid(date)) return "—";
  return format(date, "dd MMM yyyy");
}

/**
 * Formats an ISO date string to date + time.
 * e.g. "15 Jan 2025, 14:32"
 */
export function formatDateTime(dateString) {
  if (!dateString) return "—";
  const date =
    typeof dateString === "string" ? parseISO(dateString) : dateString;
  if (!isValid(date)) return "—";
  return format(date, "dd MMM yyyy, HH:mm");
}

/**
 * Returns relative time.
 * e.g. "3 hours ago", "2 days ago"
 */
export function formatRelativeTime(dateString) {
  if (!dateString) return "—";
  const date =
    typeof dateString === "string" ? parseISO(dateString) : dateString;
  if (!isValid(date)) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

/**
 * Maps document status to display config.
 */
export const STATUS_CONFIG = {
  pending: {
    label: "Pending Review",
    color: "text-amber-700 bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
  },
  approved: {
    label: "Approved",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
  },
  rejected: {
    label: "Rejected",
    color: "text-red-700 bg-red-50 border-red-200",
    dot: "bg-red-500",
  },
  expired: {
    label: "Expired",
    color: "text-gray-600 bg-gray-50 border-gray-200",
    dot: "bg-gray-400",
  },
};

/**
 * Maps user account status to display config.
 */
export const ACCOUNT_STATUS_CONFIG = {
  pending: {
    label: "Pending Approval",
    color: "text-amber-700 bg-amber-50",
  },
  active: {
    label: "Active",
    color: "text-emerald-700 bg-emerald-50",
  },
  suspended: {
    label: "Suspended",
    color: "text-red-700 bg-red-50",
  },
  rejected: {
    label: "Rejected",
    color: "text-gray-600 bg-gray-50",
  },
};

/**
 * Maps document type keys to human-readable labels.
 */
export const DOCUMENT_TYPE_LABELS = {
  nationalId: "National ID",
  passport: "Passport",
  utilityBill: "Utility Bill",
  businessCert: "Business Certificate",
  tinCertificate: "TIN Certificate",
};

/**
 * Formats file size in bytes to human-readable.
 * e.g. 1048576 → "1.0 MB"
 */
export function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
