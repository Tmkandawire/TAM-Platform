/**
 * @file pages/member/NotificationsPage.jsx
 * @module pages/member
 *
 * Member notification feed — communication center.
 *
 * FIXES APPLIED:
 *  1. EmptyState MAP — correct Icon, heading, sub per status; ALL fallback added
 *  2. MessageModal Archive/Delete — String(_id) on both calls
 *  3. NotificationRow key — n._id?.toString() to prevent [object Object] key
 *  4. StatusBadge — stripped blue; UNREAD uses primary-50/700 (TAM red tones)
 */

import {
  useState,
  useCallback,
  useReducer,
  useEffect,
  useRef,
  memo,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Bell,
  CheckCircle2,
  FileText,
  ShieldAlert,
  Megaphone,
  MoreHorizontal,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Archive,
  Mail,
  MailOpen,
  Trash2,
  Calendar,
} from "lucide-react";
import notificationService, {
  NOTIFICATION_QUERY_KEYS,
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPE,
  canTransition,
} from "../../services/notification.service.js";
import { cn } from "../../utils/cn.js";

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */

const PAGE_SIZE = 20;

const TABS = [
  { key: "ALL", label: "All" },
  { key: NOTIFICATION_STATUS.UNREAD, label: "Unread" },
  { key: NOTIFICATION_STATUS.READ, label: "Read" },
  { key: NOTIFICATION_STATUS.ARCHIVED, label: "Archived" },
];

const TYPE_CFG = {
  [NOTIFICATION_TYPE.DOCUMENT_APPROVED]: {
    label: "Document Approved",
    Icon: CheckCircle2,
    iconClass: "text-secondary-600",
    iconBg: "bg-secondary-50 border-secondary-100",
    badgeClass: "bg-secondary-50 text-secondary-700 border-secondary-100",
    accentClass: "border-l-secondary-400",
  },
  [NOTIFICATION_TYPE.DOCUMENT_REJECTED]: {
    label: "Document Rejected",
    Icon: FileText,
    iconClass: "text-primary-600",
    iconBg: "bg-primary-50 border-primary-100",
    badgeClass: "bg-primary-50 text-primary-700 border-primary-100",
    accentClass: "border-l-primary-400",
  },
  [NOTIFICATION_TYPE.ACCOUNT_ACTION]: {
    label: "Account",
    Icon: ShieldAlert,
    iconClass: "text-gray-600",
    iconBg: "bg-gray-50 border-gray-200",
    badgeClass: "bg-gray-50 text-gray-700 border-gray-200",
    accentClass: "border-l-gray-400",
  },
  [NOTIFICATION_TYPE.BROADCAST]: {
    label: "Broadcast",
    Icon: Megaphone,
    iconClass: "text-gray-600",
    iconBg: "bg-gray-50 border-gray-200",
    badgeClass: "bg-gray-50 text-gray-700 border-gray-200",
    accentClass: "border-l-gray-400",
  },
};

const FALLBACK_CFG = {
  label: "Notice",
  Icon: Bell,
  iconClass: "text-gray-500",
  iconBg: "bg-gray-50 border-gray-200",
  badgeClass: "bg-gray-50 text-gray-600 border-gray-200",
  accentClass: "border-l-gray-300",
};

function getCfg(type) {
  return TYPE_CFG[type] ?? FALLBACK_CFG;
}

/* ─────────────────────────────────────────────────────────────────────────────
   DATE HELPERS
───────────────────────────────────────────────────────────────────────────── */

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function timeAgo(value) {
  const d = parseDate(value);
  if (!d) return "—";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFull(value) {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   OPTIMISTIC UPDATER
───────────────────────────────────────────────────────────────────────────── */

function optimisticUpdate(queryClient, feedKey, { newStatus, remove = false }) {
  return {
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: feedKey });
      const prev = queryClient.getQueryData(feedKey);
      queryClient.setQueryData(feedKey, (old) => {
        if (!old?.notifications) return old;
        const updated = remove
          ? old.notifications.filter((n) => n._id !== id)
          : old.notifications.map((n) =>
              n._id === id ? { ...n, status: newStatus } : n,
            );
        return { ...old, notifications: updated };
      });
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(feedKey, ctx.prev);
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONFIRM REDUCER
───────────────────────────────────────────────────────────────────────────── */

const CONFIRM_INIT = { open: false, type: null, targetId: null };

function confirmReducer(state, action) {
  switch (action.type) {
    case "OPEN_DELETE":
      return { open: true, type: "delete", targetId: action.id };
    case "OPEN_CLEAR_ARCHIVED":
      return { open: true, type: "clearArchived", targetId: null };
    case "CLOSE":
      return CONFIRM_INIT;
    default:
      return state;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   SKELETON
───────────────────────────────────────────────────────────────────────────── */

function Skeleton({ className }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-gray-100", className)} />
  );
}

function NotificationSkeleton({ isLast }) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 px-6 py-4",
        !isLast && "border-b border-gray-50",
      )}
    >
      <Skeleton className="w-9 h-9 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <Skeleton className="h-5 w-24 rounded-full flex-shrink-0" />
      <Skeleton className="h-3 w-14 flex-shrink-0" />
      <Skeleton className="h-5 w-14 rounded-full flex-shrink-0" />
      <Skeleton className="h-7 w-14 rounded-lg flex-shrink-0" />
      <Skeleton className="h-7 w-7 rounded-lg flex-shrink-0" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   EMPTY STATE
   FIX: MAP now contains Icon, heading, sub for every status key.
        ALL fallback also defined so MAP[tab] ?? MAP.ALL never crashes.
───────────────────────────────────────────────────────────────────────────── */

function EmptyState({ tab }) {
  const MAP = {
    ALL: {
      Icon: Inbox,
      heading: "No notifications yet",
      sub: "You're all caught up. New messages will appear here.",
    },
    [NOTIFICATION_STATUS.UNREAD]: {
      Icon: Mail,
      heading: "No unread notifications",
      sub: "You've read everything — nothing left to catch up on.",
    },
    [NOTIFICATION_STATUS.READ]: {
      Icon: MailOpen,
      heading: "No read notifications",
      sub: "Notifications you've opened will show up here.",
    },
    [NOTIFICATION_STATUS.ARCHIVED]: {
      Icon: Archive,
      heading: "Nothing archived",
      sub: "Notifications you archive will be stored here.",
    },
  };

  const { Icon, heading, sub } = MAP[tab] ?? MAP.ALL;

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center">
        <Icon className="w-7 h-7 text-gray-300" aria-hidden="true" />
      </div>
      <div>
        <p className="font-display font-bold text-gray-900 text-base">
          {heading}
        </p>
        <p className="font-body text-gray-400 text-sm mt-1">{sub}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   OVERFLOW MENU
───────────────────────────────────────────────────────────────────────────── */

function OverflowMenu({ notification, onMarkRead, onArchive, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { _id, status } = notification;
  const canRead = canTransition(status, NOTIFICATION_STATUS.READ);
  const canArchive = canTransition(status, NOTIFICATION_STATUS.ARCHIVED);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        aria-label="More options"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          open
            ? "bg-gray-100 text-gray-700 border border-gray-200"
            : "text-gray-400 hover:bg-gray-100 hover:text-gray-700",
        )}
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 top-8 z-50 bg-white border border-gray-100 rounded-xl shadow-lg min-w-[160px] overflow-hidden py-1"
          >
            {canRead && (
              <DropItem
                Icon={MailOpen}
                label="Mark as Read"
                onClick={() => {
                  setOpen(false);
                  onMarkRead(String(_id));
                }}
              />
            )}
            {canArchive && (
              <DropItem
                Icon={Archive}
                label="Archive"
                onClick={() => {
                  setOpen(false);
                  onArchive(String(_id));
                }}
              />
            )}
            <DropItem
              Icon={Trash2}
              label="Delete"
              danger
              onClick={() => {
                setOpen(false);
                onDelete(String(_id));
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DropItem({ Icon, label, danger = false, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 w-full px-4 py-2.5 text-left",
        "font-body text-sm transition-colors duration-100",
        danger
          ? "text-gray-600 hover:bg-primary-50 hover:text-primary-700"
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
      )}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   STATUS BADGE
   FIX: Stripped blue. UNREAD uses primary-50/700 (TAM red tones).
───────────────────────────────────────────────────────────────────────────── */

function StatusBadge({ status }) {
  const MAP = {
    [NOTIFICATION_STATUS.UNREAD]: {
      label: "unread",
      className: "bg-primary-50 text-primary-700 border-primary-100",
    },
    [NOTIFICATION_STATUS.READ]: {
      label: "read",
      className: "bg-gray-50 text-gray-500 border-gray-200",
    },
    [NOTIFICATION_STATUS.ARCHIVED]: {
      label: "archived",
      className: "bg-gray-100 text-gray-500 border-gray-200",
    },
  };
  const s = MAP[status] ?? MAP[NOTIFICATION_STATUS.READ];
  return (
    <span
      className={cn(
        "flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full border",
        "font-body text-2xs font-medium",
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   COLUMN HEADER
───────────────────────────────────────────────────────────────────────────── */

function ColHeader() {
  return (
    <div className="flex items-center gap-4 px-6 py-2.5 bg-gray-50/70 dark:bg-white/5 border-b border-gray-100 dark:border-white/10">
      <div className="w-9 flex-shrink-0" />

      <span className="flex-1 min-w-0 font-body text-2xs font-semibold text-gray-400 dark:text-gray-300 uppercase tracking-wider">
        Notification
      </span>

      <span className="w-28 flex-shrink-0 font-body text-2xs font-semibold text-gray-400 dark:text-gray-300 uppercase tracking-wider">
        Type
      </span>

      <span className="w-16 flex-shrink-0 font-body text-2xs font-semibold text-gray-400 dark:text-gray-300 uppercase tracking-wider text-right">
        Time
      </span>

      <span className="w-16 flex-shrink-0 font-body text-2xs font-semibold text-gray-400 dark:text-gray-300 uppercase tracking-wider">
        Status
      </span>

      <div className="w-20 flex-shrink-0" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   NOTIFICATION ROW
───────────────────────────────────────────────────────────────────────────── */

const NotificationRow = memo(function NotificationRow({
  notification,
  onView,
  onMarkRead,
  onArchive,
  onDelete,
  isLast,
}) {
  const { status, type, title, message, createdAt } = notification;
  const cfg = getCfg(type);
  const { Icon } = cfg;
  const isUnread = status === NOTIFICATION_STATUS.UNREAD;
  const isArchived = status === NOTIFICATION_STATUS.ARCHIVED;
  const isRead = status === NOTIFICATION_STATUS.READ;

  const preview =
    typeof message === "string" && message.length > 80
      ? message.slice(0, 80) + "…"
      : (message ?? "");

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-6 py-4 transition-colors duration-150",
        "border-l-2",
        !isLast && "border-b border-gray-50",
        isUnread ? cfg.accentClass : "border-l-transparent",
        isArchived ? "opacity-50" : "hover:bg-gray-50/60",
      )}
    >
      {/* Type icon */}
      <div
        className={cn(
          "w-9 h-9 flex-shrink-0 rounded-xl border flex items-center justify-center",
          cfg.iconBg,
        )}
      >
        <Icon className={cn("w-4 h-4", cfg.iconClass)} aria-hidden="true" />
      </div>

      {/* Title + preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {isUnread && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0"
              aria-hidden="true"
            />
          )}
          <span
            className={cn(
              "font-body text-sm truncate",
              isUnread ? "font-semibold text-gray-900" : "font-medium",
              isRead || isArchived ? "text-gray-500" : "text-gray-900",
              isArchived ? "italic" : "",
            )}
          >
            {title}
          </span>
        </div>
        <p className="font-body text-xs text-gray-400 truncate">{preview}</p>
      </div>

      {/* Type badge */}
      <span
        className={cn(
          "w-28 flex-shrink-0 inline-flex items-center justify-center px-2.5 py-0.5 rounded-full border",
          "font-body text-2xs font-medium truncate",
          cfg.badgeClass,
        )}
      >
        {cfg.label}
      </span>

      {/* Time */}
      <span className="w-16 flex-shrink-0 font-body text-xs text-gray-400 text-right">
        {timeAgo(createdAt)}
      </span>

      {/* Status badge */}
      <div className="w-16 flex-shrink-0">
        <StatusBadge status={status} />
      </div>

      {/* Actions */}
      <div className="w-20 flex-shrink-0 flex items-center justify-end gap-1.5">
        <button
          onClick={() => onView(notification)}
          className={cn(
            "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg",
            "font-body text-xs font-medium transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
            "bg-gray-100 text-gray-700 border border-gray-200",
            "hover:bg-gray-900 hover:text-white hover:border-gray-900",
          )}
        >
          View
        </button>
        <OverflowMenu
          notification={notification}
          onMarkRead={onMarkRead}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────────────────────
   MESSAGE MODAL
   FIX: Archive and Delete buttons now call String(_id) explicitly.
───────────────────────────────────────────────────────────────────────────── */

function MessageModal({
  notification,
  onClose,
  onMarkRead,
  onArchive,
  onDeleteRequest,
}) {
  const cfg = getCfg(notification.type);
  const { Icon } = cfg;
  const { _id, status, title, message, createdAt } = notification;
  const isUnread = status === NOTIFICATION_STATUS.UNREAD;
  const canArchive = canTransition(status, NOTIFICATION_STATUS.ARCHIVED);
  const prefersReducedMotion = useReducedMotion();

  // Auto mark as read on open
  useEffect(() => {
    if (isUnread) onMarkRead(String(_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape to close
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/50"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          initial={{
            opacity: 0,
            y: prefersReducedMotion ? 0 : 16,
            scale: prefersReducedMotion ? 1 : 0.98,
          }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{
            opacity: 0,
            y: prefersReducedMotion ? 0 : 8,
            scale: prefersReducedMotion ? 1 : 0.98,
          }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        >
          <div className="p-6 sm:p-8 overflow-y-auto flex-1 flex flex-col">
            {/* Header row: date + close */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2 text-gray-400">
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="font-body text-xs">
                  {formatFull(createdAt)}
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  "text-gray-400 hover:text-gray-700 hover:bg-gray-100",
                  "border border-gray-200 transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                )}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Type badge */}
            <div className="mb-4">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border",
                  "font-body text-xs font-medium",
                  cfg.badgeClass,
                )}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                {cfg.label}
              </span>
            </div>

            {/* Title */}
            <h2 className="font-display font-bold text-gray-900 text-xl sm:text-2xl leading-snug mb-5">
              {title}
            </h2>

            {/* Message body */}
            <div className="bg-gray-50 rounded-xl border border-gray-100 px-5 py-4 mb-6 overflow-y-auto max-h-64">
              <p className="font-body text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {message}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5">
              {canArchive && (
                <button
                  onClick={() => {
                    onArchive(String(_id));
                    onClose();
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg",
                    "font-body text-sm font-medium transition-colors duration-150",
                    "bg-gray-100 text-gray-700 border border-gray-200",
                    "hover:bg-gray-200 hover:text-gray-900",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2",
                  )}
                >
                  <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                  Archive
                </button>
              )}
              <button
                onClick={() => {
                  onClose();
                  onDeleteRequest(String(_id));
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg",
                  "font-body text-sm font-medium transition-colors duration-150",
                  "bg-primary-50 text-primary-700 border border-primary-200",
                  "hover:bg-primary-100",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
                )}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                Delete
              </button>
              <button
                onClick={onClose}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg",
                  "font-body text-sm font-medium transition-colors duration-150",
                  "bg-gray-900 text-white",
                  "hover:bg-gray-700",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2",
                )}
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONFIRM DIALOG
───────────────────────────────────────────────────────────────────────────── */

function ConfirmDialog({ confirm, onConfirm, onCancel, isPending }) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!confirm.open) return;
    const h = (e) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [confirm.open, onCancel]);

  const COPY = {
    delete: {
      heading: "Delete Notification",
      body: "This is permanent and cannot be undone.",
      cta: "Delete",
    },
    clearArchived: {
      heading: "Clear All Archived",
      body: "All archived notifications will be permanently deleted.",
      cta: "Clear All",
    },
  };
  const { heading, body, cta } = COPY[confirm.type] ?? COPY.delete;

  return (
    <AnimatePresence>
      {confirm.open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCancel();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.97 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
          >
            <p className="font-display font-bold text-gray-900 text-base mb-1">
              {heading}
            </p>
            <p className="font-body text-sm text-gray-500 leading-relaxed mb-5">
              {body}
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={onCancel}
                disabled={isPending}
                className={cn(
                  "px-4 py-2 rounded-lg font-body text-sm font-medium",
                  "bg-gray-100 text-gray-700 border border-gray-200",
                  "hover:bg-gray-200 transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2",
                  isPending && "opacity-50 cursor-not-allowed",
                )}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={isPending}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg",
                  "font-body text-sm font-medium transition-colors duration-150",
                  "bg-primary-500 text-white hover:bg-primary-600",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
                  isPending && "opacity-60 cursor-not-allowed",
                )}
              >
                {isPending && (
                  <RefreshCw
                    className="w-3.5 h-3.5 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {isPending ? "Removing…" : cta}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   PAGE
───────────────────────────────────────────────────────────────────────────── */

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();

  const [activeTab, setActiveTab] = useState("ALL");
  const [page, setPage] = useState(1);
  const [confirm, dispatchConfirm] = useReducer(confirmReducer, CONFIRM_INIT);
  const [viewing, setViewing] = useState(null);

  // ── Feed params ──────────────────────────────────────────────────────────
  const feedParams = {
    page,
    limit: PAGE_SIZE,
    ...(activeTab !== "ALL" && { status: activeTab }),
  };
  const feedKey = NOTIFICATION_QUERY_KEYS.feed(feedParams);

  // ── Queries ──────────────────────────────────────────────────────────────
  const {
    data: feedData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: feedKey,
    queryFn: async () => {
      const res = await notificationService.getFeed(feedParams);
      return (
        res?.data?.data ??
        res?.data ?? { notifications: [], pages: 1, total: 0 }
      );
    },
    keepPreviousData: true,
    staleTime: 30_000,
    retry: false,
  });

  const { data: unreadData } = useQuery({
    queryKey: NOTIFICATION_QUERY_KEYS.unreadCount,
    queryFn: async () => {
      const res = await notificationService.getUnreadCount();
      return res?.data?.data ?? res?.data ?? { count: 0 };
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
  });

  const notifications = feedData?.notifications ?? [];
  const totalPages = feedData?.pages ?? 1;
  const totalCount = feedData?.total ?? 0;
  const unreadCount = unreadData?.count ?? 0;

  // ── Invalidate helper ────────────────────────────────────────────────────
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEYS.all });
  }, [queryClient]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const markReadMutation = useMutation({
    mutationFn: (id) => notificationService.markAsRead(id),
    ...optimisticUpdate(queryClient, feedKey, {
      newStatus: NOTIFICATION_STATUS.READ,
    }),
    onSettled: invalidateAll,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSettled: invalidateAll,
  });

  const archiveMutation = useMutation({
    mutationFn: (id) => notificationService.archive(id),
    ...optimisticUpdate(queryClient, feedKey, {
      newStatus: NOTIFICATION_STATUS.ARCHIVED,
    }),
    onSettled: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => notificationService.deleteOne(id),
    ...optimisticUpdate(queryClient, feedKey, { remove: true }),
    onSettled: () => {
      dispatchConfirm({ type: "CLOSE" });
      invalidateAll();
    },
  });

  const clearArchivedMutation = useMutation({
    mutationFn: () => notificationService.clearArchived(),
    onSettled: () => {
      dispatchConfirm({ type: "CLOSE" });
      invalidateAll();
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (confirm.type === "delete") deleteMutation.mutate(confirm.targetId);
    if (confirm.type === "clearArchived") clearArchivedMutation.mutate();
  }, [confirm, deleteMutation, clearArchivedMutation]);

  const handleTabChange = useCallback((key) => {
    setActiveTab(key);
    setPage(1);
  }, []);

  const isAnyMutating =
    markReadMutation.isPending ||
    archiveMutation.isPending ||
    deleteMutation.isPending ||
    clearArchivedMutation.isPending ||
    markAllReadMutation.isPending;

  // ── Fade-up animation ────────────────────────────────────────────────────
  const fadeUp = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: prefersReducedMotion ? 0 : 0.35,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        visible: {
          transition: { staggerChildren: prefersReducedMotion ? 0 : 0.06 },
        },
      }}
      className="space-y-6 max-w-5xl"
    >
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div>
          <h1 className="font-display font-bold text-gray-900 text-2xl sm:text-3xl">
            Notifications
          </h1>
          <p className="font-body text-gray-400 text-sm mt-1">
            Stay updated with messages and alerts from TAM.
          </p>
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          {isFetching && !isLoading && (
            <span className="font-body text-xs text-gray-400 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" aria-hidden="true" />
              Syncing
            </span>
          )}
          {unreadCount > 0 && (
            <button
              onClick={() => markAllReadMutation.mutate()}
              disabled={isAnyMutating}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                "font-body text-sm font-medium transition-colors duration-150",
                "bg-gray-100 text-gray-700 border border-gray-200",
                "hover:bg-gray-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2",
                isAnyMutating && "opacity-50 cursor-not-allowed",
              )}
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Mark All as Read
            </button>
          )}
          {activeTab === NOTIFICATION_STATUS.ARCHIVED && totalCount > 0 && (
            <button
              onClick={() => dispatchConfirm({ type: "OPEN_CLEAR_ARCHIVED" })}
              disabled={isAnyMutating}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                "font-body text-sm font-medium transition-colors duration-150",
                "bg-primary-50 text-primary-700 border border-primary-200",
                "hover:bg-primary-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
                isAnyMutating && "opacity-50 cursor-not-allowed",
              )}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              Clear Archived
            </button>
          )}
        </div>
      </motion.div>

      {/* ── Card ───────────────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="bg-white rounded-xl border border-gray-100 overflow-hidden"
      >
        {/* Tabs */}
        <div className="flex items-center border-b border-gray-100 px-6 bg-gray-50/50">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={cn(
                  "flex items-center gap-2 py-3.5 px-1 mr-6 last:mr-0",
                  "font-body text-sm font-medium transition-colors duration-150",
                  "border-b-2 -mb-px",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-0",
                  active
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700",
                )}
              >
                {tab.label}
                {tab.key === NOTIFICATION_STATUS.UNREAD && unreadCount > 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center w-5 h-5 rounded-full",
                      "font-body text-2xs font-bold",
                      active
                        ? "bg-primary-500 text-white"
                        : "bg-gray-200 text-gray-600",
                    )}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {isLoading ? (
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <NotificationSkeleton key={i} isLast={i === 4} />
            ))}
          </>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center">
              <Bell className="w-6 h-6 text-primary-400" aria-hidden="true" />
            </div>
            <div>
              <p className="font-display font-bold text-gray-900 text-base">
                Failed to load notifications
              </p>
              <p className="font-body text-gray-500 text-sm mt-1">
                Something went wrong. Please try again.
              </p>
            </div>
            <button
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: feedKey })
              }
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                "font-body text-sm font-medium",
                "bg-gray-900 text-white hover:bg-gray-800 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2",
              )}
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Try Again
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <>
            <ColHeader />
            {notifications.map((n, i) => (
              <NotificationRow
                key={n._id?.toString() ?? i}
                notification={n}
                onView={setViewing}
                onMarkRead={(id) => {
                  if (canTransition(n.status, NOTIFICATION_STATUS.READ))
                    markReadMutation.mutate(id);
                }}
                onArchive={(id) => {
                  if (canTransition(n.status, NOTIFICATION_STATUS.ARCHIVED))
                    archiveMutation.mutate(id);
                }}
                onDelete={(id) => dispatchConfirm({ type: "OPEN_DELETE", id })}
                isLast={i === notifications.length - 1}
              />
            ))}
          </>
        )}
      </motion.div>

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {!isLoading && totalPages > 1 && (
        <motion.div
          variants={fadeUp}
          className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-5 py-3.5"
        >
          <span className="font-body text-xs text-gray-400">
            Page {page} of {totalPages} · {totalCount} total
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                "font-body text-xs font-medium transition-colors duration-150 border",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2",
                page <= 1 || isFetching
                  ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900",
              )}
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg",
                "font-body text-xs font-medium transition-colors duration-150 border",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2",
                page >= totalPages || isFetching
                  ? "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900",
              )}
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Message modal ───────────────────────────────────────────────────── */}
      {viewing && (
        <MessageModal
          notification={viewing}
          onClose={() => setViewing(null)}
          onMarkRead={(id) => markReadMutation.mutate(id)}
          onArchive={(id) => archiveMutation.mutate(id)}
          onDeleteRequest={(id) => dispatchConfirm({ type: "OPEN_DELETE", id })}
        />
      )}

      {/* ── Confirm dialog ──────────────────────────────────────────────────── */}
      <ConfirmDialog
        confirm={confirm}
        onConfirm={handleConfirm}
        onCancel={() => dispatchConfirm({ type: "CLOSE" })}
        isPending={deleteMutation.isPending || clearArchivedMutation.isPending}
      />
    </motion.div>
  );
}
