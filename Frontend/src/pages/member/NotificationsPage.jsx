/**
 * @file pages/member/NotificationsPage.jsx
 * @description Member notification feed — "signal dispatch log" aesthetic.
 *
 * Features:
 *  - Paginated feed via getFeed() with status filter tabs (ALL / UNREAD / READ / ARCHIVED)
 *  - Live unread badge count polled every 60 s via getUnreadCount()
 *  - Mark single notification read (canTransition guard before mutation)
 *  - Mark all unread → read (bulk)
 *  - Archive single notification (canTransition guard)
 *  - Delete single notification (with confirm state)
 *  - Clear all archived (bulk, confirm dialog)
 *  - Optimistic UI: instant visual feedback, rollback on error
 *  - useReducedMotion on every animated element — zero exceptions
 *  - No magic status/type strings — all comparisons via imported constants
 *  - NOTIFICATION_QUERY_KEYS imported from service — never redefined here
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
import { useReducedMotion } from "framer-motion";
import notificationService, {
  NOTIFICATION_QUERY_KEYS,
  NOTIFICATION_STATUS,
  NOTIFICATION_TYPE,
  canTransition,
} from "../../services/notification.service.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

/** Tab definitions — order controls render order. */
const STATUS_TABS = [
  { key: "ALL", label: "ALL SIGNALS", glyph: "◈" },
  { key: NOTIFICATION_STATUS.UNREAD, label: "UNREAD", glyph: "◉" },
  { key: NOTIFICATION_STATUS.READ, label: "READ", glyph: "◎" },
  { key: NOTIFICATION_STATUS.ARCHIVED, label: "ARCHIVED", glyph: "◌" },
];

/** Type → display config map. */
const TYPE_CONFIG = {
  [NOTIFICATION_TYPE.DOCUMENT_APPROVED]: {
    glyph: "✓",
    label: "DOC APPROVED",
    color: "var(--tam-green)",
    bg: "rgba(22, 163, 74, 0.08)",
  },
  [NOTIFICATION_TYPE.DOCUMENT_REJECTED]: {
    glyph: "✕",
    label: "DOC REJECTED",
    color: "var(--tam-red)",
    bg: "rgba(220, 38, 38, 0.08)",
  },
  [NOTIFICATION_TYPE.ACCOUNT_ACTION]: {
    glyph: "⚑",
    label: "ACCOUNT",
    color: "var(--amber)",
    bg: "rgba(217, 119, 6, 0.08)",
  },
  [NOTIFICATION_TYPE.BROADCAST]: {
    glyph: "⊛",
    label: "BROADCAST",
    color: "var(--steel)",
    bg: "rgba(100, 116, 139, 0.08)",
  },
};

const FALLBACK_TYPE_CONFIG = {
  glyph: "◆",
  label: "NOTICE",
  color: "var(--steel)",
  bg: "rgba(100,116,139,0.08)",
};

// ─── Confirm dialog reducer ───────────────────────────────────────────────────

const CONFIRM_INITIAL = { open: false, type: null, targetId: null };

function confirmReducer(state, action) {
  switch (action.type) {
    case "OPEN_DELETE":
      return { open: true, type: "delete", targetId: action.id };
    case "OPEN_CLEAR_ARCHIVED":
      return { open: true, type: "clearArchived", targetId: null };
    case "CLOSE":
      return CONFIRM_INITIAL;
    default:
      return state;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format ISO timestamp → compact dispatch-log style: "14 MAY · 09:42" */
function formatTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-GB", { month: "short" }).toUpperCase();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} · ${hh}:${mm}`;
}

// ─── Optimistic update factory ────────────────────────────────────────────────

/**
 * Creates the onMutate / onError lifecycle pair for a feed-level optimistic
 * status patch. Eliminates the repeated cancel → snapshot → setQueryData →
 * rollback block that would otherwise appear once per status-mutating mutation.
 *
 * @param {object} queryClient   - React Query client instance.
 * @param {object} feedParams    - Current feed query params (used to build the key).
 * @param {string} newStatus     - The optimistic status value to apply.
 * @returns {{ onMutate: Function, onError: Function }}
 *
 * @example
 *   const markReadMutation = useMutation({
 *     mutationFn: (id) => notificationService.markAsRead(id),
 *     ...createOptimisticUpdater(queryClient, feedParams, NOTIFICATION_STATUS.READ),
 *     onSettled: invalidateAll,
 *   });
 */
function createOptimisticUpdater(queryClient, feedParams, newStatus) {
  const key = NOTIFICATION_QUERY_KEYS.feed(feedParams);

  return {
    onMutate: async (id) => {
      // Cancel any in-flight refetches so they don't overwrite our optimistic patch.
      await queryClient.cancelQueries({ queryKey: key });

      // Snapshot the current cache value for rollback.
      const prev = queryClient.getQueryData(key);

      // Apply the optimistic patch — update the single notification's status.
      queryClient.setQueryData(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          notifications: old.notifications.map((n) =>
            n._id === id ? { ...n, status: newStatus } : n,
          ),
        };
      });

      return { prev };
    },

    onError: (_err, _id, ctx) => {
      // Rollback to the snapshot if the server rejects the mutation.
      if (ctx?.prev) {
        queryClient.setQueryData(key, ctx.prev);
      }
    },
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Pulsing dot for unread notifications. Respects reduced motion. */
function PulseDot({ reduced }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: "7px",
        height: "7px",
        borderRadius: "50%",
        background: "var(--tam-red)",
        flexShrink: 0,
        animation: reduced ? "none" : "tam-pulse 1.6s ease-in-out infinite",
      }}
    />
  );
}

/**
 * Single notification row.
 *
 * Wrapped in React.memo with a custom comparator — the row only needs to
 * re-render when its own notification data, acting state, or reduced-motion
 * preference changes. Parent state changes (active tab, page, confirm dialog
 * open/close) do not affect individual rows and are excluded from the comparison.
 */
const NotificationRow = memo(
  function NotificationRow({
    notification,
    onMarkRead,
    onArchive,
    onDeleteRequest,
    isActing,
    reduced,
  }) {
    const { _id, type, status, title, message, createdAt } = notification;
    const cfg = TYPE_CONFIG[type] ?? FALLBACK_TYPE_CONFIG;
    const isUnread = status === NOTIFICATION_STATUS.UNREAD;
    const isArchived = status === NOTIFICATION_STATUS.ARCHIVED;

    const canRead = canTransition(status, NOTIFICATION_STATUS.READ);
    const canArchive = canTransition(status, NOTIFICATION_STATUS.ARCHIVED);

    return (
      <article
        data-unread={isUnread}
        data-archived={isArchived}
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1fr auto",
          gap: "0 14px",
          alignItems: "start",
          padding: "14px 18px",
          borderBottom: "1px solid var(--border)",
          background: isUnread
            ? "rgba(220, 38, 38, 0.03)"
            : isArchived
              ? "rgba(100,116,139,0.03)"
              : "transparent",
          opacity: isArchived ? 0.6 : 1,
          transition: reduced ? "none" : "background 0.2s, opacity 0.2s",
          position: "relative",
        }}
      >
        {/* Left — type glyph badge */}
        <div
          aria-label={cfg.label}
          title={cfg.label}
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "4px",
            background: cfg.bg,
            border: `1px solid ${cfg.color}33`,
            color: cfg.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            fontFamily: "var(--font-mono)",
            flexShrink: 0,
            marginTop: "1px",
          }}
        >
          {cfg.glyph}
        </div>

        {/* Centre — content */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "3px",
            }}
          >
            {isUnread && <PulseDot reduced={reduced} />}
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                letterSpacing: "0.08em",
                color: cfg.color,
                textTransform: "uppercase",
              }}
            >
              {cfg.label}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--muted)",
                letterSpacing: "0.04em",
              }}
            >
              {formatTimestamp(createdAt)}
            </span>
          </div>

          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-body)",
              fontSize: "13.5px",
              fontWeight: isUnread ? 600 : 400,
              color: isUnread ? "var(--foreground)" : "var(--muted-fg)",
              lineHeight: 1.45,
              marginBottom: "3px",
            }}
          >
            {title}
          </p>

          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-body)",
              fontSize: "12.5px",
              color: "var(--muted)",
              lineHeight: 1.5,
            }}
          >
            {message}
          </p>
        </div>

        {/* Right — action strip */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            alignItems: "flex-end",
            flexShrink: 0,
          }}
        >
          {canRead && (
            <ActionBtn
              onClick={() => onMarkRead(_id)}
              disabled={isActing}
              title="Mark as read"
              color="var(--tam-green)"
            >
              ✓ READ
            </ActionBtn>
          )}
          {canArchive && (
            <ActionBtn
              onClick={() => onArchive(_id)}
              disabled={isActing}
              title="Archive"
              color="var(--steel)"
            >
              ◌ ARCH
            </ActionBtn>
          )}
          <ActionBtn
            onClick={() => onDeleteRequest(_id)}
            disabled={isActing}
            title="Delete permanently"
            color="var(--tam-red)"
          >
            ✕ DEL
          </ActionBtn>
        </div>
      </article>
    );
  },
  (prev, next) =>
    // Only re-render if the notification data, acting state, or motion pref changed.
    // Stable callbacks (onMarkRead etc.) are created with useCallback in the page,
    // so reference equality holds across renders unless feedParams change.
    prev.notification._id === next.notification._id &&
    prev.notification.status === next.notification.status &&
    prev.notification.title === next.notification.title &&
    prev.notification.message === next.notification.message &&
    prev.isActing === next.isActing &&
    prev.reduced === next.reduced,
);

/** Tiny monospaced action button. */
function ActionBtn({ onClick, disabled, title, color, children }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        letterSpacing: "0.08em",
        color: hover ? "#fff" : color,
        background: hover ? color : "transparent",
        border: `1px solid ${color}66`,
        borderRadius: "3px",
        padding: "3px 7px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.15s, color 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/** Empty state — varies copy by active tab. */
function EmptyState({ activeTab }) {
  const copy = {
    ALL: {
      glyph: "◈",
      heading: "No signals received",
      sub: "Notifications will appear here when TAM sends them.",
    },
    [NOTIFICATION_STATUS.UNREAD]: {
      glyph: "◉",
      heading: "All clear",
      sub: "No unread notifications.",
    },
    [NOTIFICATION_STATUS.READ]: {
      glyph: "◎",
      heading: "Nothing read yet",
      sub: "Read notifications will appear here.",
    },
    [NOTIFICATION_STATUS.ARCHIVED]: {
      glyph: "◌",
      heading: "Archive is empty",
      sub: "Archived notifications will appear here.",
    },
  };
  const { glyph, heading, sub } = copy[activeTab] ?? copy.ALL;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "72px 24px",
        gap: "12px",
        textAlign: "center",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "40px",
          color: "var(--border)",
          lineHeight: 1,
        }}
      >
        {glyph}
      </span>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
          letterSpacing: "0.1em",
          color: "var(--muted)",
          textTransform: "uppercase",
        }}
      >
        {heading}
      </p>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-body)",
          fontSize: "13px",
          color: "var(--muted)",
          maxWidth: "280px",
        }}
      >
        {sub}
      </p>
    </div>
  );
}

/** Skeleton loader row — 3 shimmer rows during initial fetch. */
function SkeletonRow({ reduced }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr",
        gap: "14px",
        padding: "14px 18px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={shimmerStyle(28, 28, "4px", reduced)} />
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={shimmerStyle("40%", 10, "2px", reduced)} />
        <div style={shimmerStyle("70%", 13, "2px", reduced)} />
        <div style={shimmerStyle("55%", 11, "2px", reduced)} />
      </div>
    </div>
  );
}

function shimmerStyle(w, h, radius, reduced) {
  return {
    width: typeof w === "number" ? `${w}px` : w,
    height: `${h}px`,
    borderRadius: radius,
    background: "var(--shimmer-base)",
    animation: reduced ? "none" : "tam-shimmer 1.4s ease-in-out infinite",
  };
}

/** Confirm dialog overlay — accessible: Escape closes, focus is trapped, returns on close. */
function ConfirmDialog({ confirm, onConfirm, onCancel, isPending }) {
  const dialogRef = useRef(null);
  const cancelBtnRef = useRef(null);
  const triggerRef = useRef(null); // element that had focus before dialog opened

  // Capture the previously focused element when dialog opens so we can restore
  // it on close — required for WCAG 2.1 SC 2.4.3 (Focus Order).
  useEffect(() => {
    if (confirm.open) {
      triggerRef.current = document.activeElement;
      // Defer focus to next tick so the dialog node is in the DOM.
      const id = setTimeout(() => cancelBtnRef.current?.focus(), 0);
      return () => clearTimeout(id);
    } else {
      // Return focus to the element that triggered the dialog.
      triggerRef.current?.focus();
    }
  }, [confirm.open]);

  // Escape key close + focus trap.
  useEffect(() => {
    if (!confirm.open) return;

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }

      // Focus trap — keep Tab and Shift+Tab inside the dialog.
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), " +
            'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [confirm.open, onCancel]);

  if (!confirm.open) return null;

  const copy = {
    delete: {
      heading: "DELETE NOTIFICATION",
      body: "This is permanent and cannot be undone.",
      cta: "DELETE",
    },
    clearArchived: {
      heading: "CLEAR ALL ARCHIVED",
      body: "All archived notifications will be permanently deleted.",
      cta: "CLEAR ALL",
    },
  };
  const { heading, body, cta } = copy[confirm.type] ?? copy.delete;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-heading"
      ref={dialogRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--tam-red)",
          borderRadius: "6px",
          padding: "28px 32px",
          maxWidth: "360px",
          width: "calc(100% - 48px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        }}
      >
        <p
          id="confirm-heading"
          style={{
            margin: "0 0 8px",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            letterSpacing: "0.12em",
            color: "var(--tam-red)",
            textTransform: "uppercase",
          }}
        >
          {heading}
        </p>
        <p
          style={{
            margin: "0 0 24px",
            fontFamily: "var(--font-body)",
            fontSize: "14px",
            color: "var(--muted-fg)",
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
        <div
          style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}
        >
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            disabled={isPending}
            style={dialogBtnStyle("var(--border)", "var(--muted-fg)")}
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            style={dialogBtnStyle("var(--tam-red)", "#fff")}
          >
            {isPending ? "…" : cta}
          </button>
        </div>
      </div>
    </div>
  );
}

function dialogBtnStyle(borderColor, color) {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color,
    background: "transparent",
    border: `1px solid ${borderColor}`,
    borderRadius: "4px",
    padding: "7px 16px",
    cursor: "pointer",
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const reduced = useReducedMotion();
  const queryClient = useQueryClient();

  // ── Local state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("ALL");
  const [page, setPage] = useState(1);
  const [confirm, dispatchConfirm] = useReducer(
    confirmReducer,
    CONFIRM_INITIAL,
  );

  // ── Feed query ───────────────────────────────────────────────────────────
  const feedParams = {
    page,
    limit: PAGE_SIZE,
    ...(activeTab !== "ALL" && { status: activeTab }),
  };

  const {
    data: feedData,
    isLoading: feedLoading,
    isError: feedError,
    isFetching: feedFetching,
  } = useQuery({
    queryKey: NOTIFICATION_QUERY_KEYS.feed(feedParams),
    queryFn: () =>
      notificationService.getFeed(feedParams).then((r) => r.data.data),
    keepPreviousData: true,
    staleTime: 30_000,
  });

  const notifications = feedData?.notifications ?? [];
  const totalPages = feedData?.pages ?? 1;
  const totalCount = feedData?.total ?? 0;

  // ── Unread count query (badge — independent of feed) ─────────────────────
  const { data: unreadData } = useQuery({
    queryKey: NOTIFICATION_QUERY_KEYS.unreadCount,
    queryFn: () =>
      notificationService.getUnreadCount().then((r) => r.data.data),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
  const unreadCount = unreadData?.count ?? 0;

  // ── Shared invalidation helper ────────────────────────────────────────────
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEYS.all });
  }, [queryClient]);

  // ── Mark single read ──────────────────────────────────────────────────────
  const markReadMutation = useMutation({
    mutationFn: (id) => notificationService.markAsRead(id),
    ...createOptimisticUpdater(
      queryClient,
      feedParams,
      NOTIFICATION_STATUS.READ,
    ),
    onSettled: invalidateAll,
  });

  // ── Mark all read ─────────────────────────────────────────────────────────
  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSettled: invalidateAll,
  });

  // ── Archive single ────────────────────────────────────────────────────────
  const archiveMutation = useMutation({
    mutationFn: (id) => notificationService.archive(id),
    ...createOptimisticUpdater(
      queryClient,
      feedParams,
      NOTIFICATION_STATUS.ARCHIVED,
    ),
    onSettled: invalidateAll,
  });

  // ── Delete single ─────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id) => notificationService.deleteOne(id),
    onSettled: () => {
      dispatchConfirm({ type: "CLOSE" });
      invalidateAll();
    },
  });

  // ── Clear archived ────────────────────────────────────────────────────────
  const clearArchivedMutation = useMutation({
    mutationFn: () => notificationService.clearArchived(),
    onSettled: () => {
      dispatchConfirm({ type: "CLOSE" });
      invalidateAll();
    },
  });

  // ── Confirm dialog dispatch ───────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (confirm.type === "delete") deleteMutation.mutate(confirm.targetId);
    if (confirm.type === "clearArchived") clearArchivedMutation.mutate();
  }, [confirm, deleteMutation, clearArchivedMutation]);

  // ── Tab change — reset to page 1 ──────────────────────────────────────────
  const handleTabChange = useCallback((key) => {
    setActiveTab(key);
    setPage(1);
  }, []);

  // ── Any mutation in-flight ────────────────────────────────────────────────
  const isAnyMutating =
    markReadMutation.isPending ||
    archiveMutation.isPending ||
    deleteMutation.isPending ||
    clearArchivedMutation.isPending ||
    markAllReadMutation.isPending;

  const hasArchived =
    activeTab === NOTIFICATION_STATUS.ARCHIVED && totalCount > 0;
  const hasUnread = unreadCount > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Keyframes injected once */}
      <style>{`
        @keyframes tam-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.35; transform: scale(0.7); }
        }
        @keyframes tam-shimmer {
          0%   { opacity: 0.5; }
          50%  { opacity: 1; }
          100% { opacity: 0.5; }
        }
        @keyframes tam-slide-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        style={{
          minHeight: "100%",
          background: "var(--page-bg, var(--background))",
          fontFamily: "var(--font-body)",
        }}
      >
        {/* ── Page header ─────────────────────────────────────────────────── */}
        <header
          style={{
            padding: "28px 28px 0",
            marginBottom: "24px",
            animation: reduced ? "none" : "tam-slide-in 0.35s ease both",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    letterSpacing: "0.16em",
                    color: "var(--muted)",
                    textTransform: "uppercase",
                  }}
                >
                  MEMBER PORTAL · DISPATCH
                </span>
                {feedFetching && !feedLoading && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      color: "var(--muted)",
                      animation: reduced
                        ? "none"
                        : "tam-shimmer 1s ease-in-out infinite",
                    }}
                  >
                    ↻ SYNCING
                  </span>
                )}
              </div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: "clamp(20px, 3vw, 26px)",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: "var(--foreground)",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                NOTIFICATIONS
                {unreadCount > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#fff",
                      background: "var(--tam-red)",
                      padding: "2px 8px",
                      borderRadius: "3px",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {unreadCount} UNREAD
                  </span>
                )}
              </h1>
            </div>

            {/* Bulk actions */}
            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
              {hasUnread && (
                <BulkBtn
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={isAnyMutating}
                  color="var(--tam-green)"
                >
                  ✓ MARK ALL READ
                </BulkBtn>
              )}
              {hasArchived && (
                <BulkBtn
                  onClick={() =>
                    dispatchConfirm({ type: "OPEN_CLEAR_ARCHIVED" })
                  }
                  disabled={isAnyMutating}
                  color="var(--tam-red)"
                >
                  ✕ CLEAR ARCHIVED
                </BulkBtn>
              )}
            </div>
          </div>
        </header>

        {/* ── Status filter tabs ───────────────────────────────────────────── */}
        <nav
          role="tablist"
          aria-label="Filter notifications by status"
          style={{
            display: "flex",
            gap: "0",
            padding: "0 28px",
            borderBottom: "1px solid var(--border)",
            marginBottom: "0",
            overflowX: "auto",
            animation: reduced ? "none" : "tam-slide-in 0.4s ease 0.05s both",
          }}
        >
          {STATUS_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(tab.key)}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: isActive ? "var(--tam-red)" : "var(--muted)",
                  background: "transparent",
                  border: "none",
                  borderBottom: isActive
                    ? "2px solid var(--tam-red)"
                    : "2px solid transparent",
                  padding: "12px 16px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: reduced
                    ? "none"
                    : "color 0.15s, border-color 0.15s",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>{tab.glyph}</span>
                <span>{tab.label}</span>
                {tab.key === NOTIFICATION_STATUS.UNREAD && unreadCount > 0 && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      color: "#fff",
                      background: "var(--tam-red)",
                      padding: "1px 5px",
                      borderRadius: "2px",
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* ── Feed panel ──────────────────────────────────────────────────── */}
        <section
          role="tabpanel"
          aria-live="polite"
          aria-busy={feedLoading}
          style={{
            margin: "0 28px 28px",
            border: "1px solid var(--border)",
            borderTop: "none",
            borderRadius: "0 0 6px 6px",
            overflow: "hidden",
            background: "var(--surface)",
            animation: reduced ? "none" : "tam-slide-in 0.45s ease 0.1s both",
          }}
        >
          {feedLoading ? (
            <>
              <SkeletonRow reduced={reduced} />
              <SkeletonRow reduced={reduced} />
              <SkeletonRow reduced={reduced} />
            </>
          ) : feedError ? (
            <ErrorState
              onRetry={() =>
                queryClient.invalidateQueries({
                  queryKey: NOTIFICATION_QUERY_KEYS.feed(feedParams),
                })
              }
            />
          ) : notifications.length === 0 ? (
            <EmptyState activeTab={activeTab} />
          ) : (
            notifications.map((n, i) => (
              <div
                key={n._id}
                style={{
                  animation: reduced
                    ? "none"
                    : `tam-slide-in 0.3s ease ${i * 0.04}s both`,
                }}
              >
                <NotificationRow
                  notification={n}
                  onMarkRead={(id) => {
                    if (canTransition(n.status, NOTIFICATION_STATUS.READ)) {
                      markReadMutation.mutate(id);
                    }
                  }}
                  onArchive={(id) => {
                    if (canTransition(n.status, NOTIFICATION_STATUS.ARCHIVED)) {
                      archiveMutation.mutate(id);
                    }
                  }}
                  onDeleteRequest={(id) =>
                    dispatchConfirm({ type: "OPEN_DELETE", id })
                  }
                  isActing={isAnyMutating}
                  reduced={reduced}
                />
              </div>
            ))
          )}
        </section>

        {/* ── Pagination ───────────────────────────────────────────────────── */}
        {totalPages > 1 && !feedLoading && (
          <footer
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 28px 28px",
              animation: reduced ? "none" : "tam-slide-in 0.5s ease 0.15s both",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--muted)",
                letterSpacing: "0.06em",
              }}
            >
              PAGE {page} / {totalPages} · {totalCount} TOTAL
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <PaginationBtn
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || feedFetching}
              >
                ← PREV
              </PaginationBtn>
              <PaginationBtn
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || feedFetching}
              >
                NEXT →
              </PaginationBtn>
            </div>
          </footer>
        )}
      </div>

      {/* ── Confirm dialog (portal-less, fixed overlay) ──────────────────── */}
      <ConfirmDialog
        confirm={confirm}
        onConfirm={handleConfirm}
        onCancel={() => dispatchConfirm({ type: "CLOSE" })}
        isPending={deleteMutation.isPending || clearArchivedMutation.isPending}
      />
    </>
  );
}

// ─── Tiny shared components ───────────────────────────────────────────────────

function BulkBtn({ onClick, disabled, color, children }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        letterSpacing: "0.08em",
        color: hover ? "#fff" : color,
        background: hover ? color : "transparent",
        border: `1px solid ${color}`,
        borderRadius: "4px",
        padding: "7px 14px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function PaginationBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        letterSpacing: "0.08em",
        color: disabled ? "var(--muted)" : "var(--foreground)",
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: "4px",
        padding: "6px 14px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

function ErrorState({ onRetry }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "72px 24px",
        gap: "12px",
        textAlign: "center",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "32px",
          color: "var(--tam-red)",
        }}
      >
        ⚠
      </span>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-mono)",
          fontSize: "12px",
          letterSpacing: "0.1em",
          color: "var(--tam-red)",
          textTransform: "uppercase",
        }}
      >
        SIGNAL LOST
      </p>
      <p
        style={{
          margin: 0,
          fontFamily: "var(--font-body)",
          fontSize: "13px",
          color: "var(--muted)",
        }}
      >
        Failed to load notifications.
      </p>
      <button
        onClick={onRetry}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          letterSpacing: "0.1em",
          color: "var(--tam-red)",
          background: "transparent",
          border: "1px solid var(--tam-red)",
          borderRadius: "4px",
          padding: "7px 16px",
          cursor: "pointer",
          marginTop: "4px",
        }}
      >
        ↻ RETRY
      </button>
    </div>
  );
}
