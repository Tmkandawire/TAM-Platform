/**
 * @file AdminInboxPage.jsx
 * @module pages/admin
 *
 * Admin contact inbox — list + detail view.
 *
 * Layout:
 *  - Left panel: filterable message list
 *  - Right panel: message detail + reply form (or empty state)
 *
 * Data:
 *  - GET /api/v1/admin/contact          — message list
 *  - GET /api/v1/admin/contact/:id      — single message (auto-marks read)
 *  - POST /api/v1/admin/contact/:id/reply
 *  - PATCH /api/v1/admin/contact/:id/archive
 *  - DELETE /api/v1/admin/contact/:id
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  MailOpen,
  Archive,
  Trash2,
  Send,
  RefreshCw,
  AlertCircle,
  Inbox,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import contactService, {
  CONTACT_QUERY_KEYS,
} from "../../services/contact.service.js";
import { formatRelativeTime } from "../../utils/formatters.js";
import { cn } from "../../utils/cn.js";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

const STATUS_FILTERS = [
  { value: undefined, label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
  { value: "archived", label: "Archived" },
];

const SUBJECT_LABELS = {
  membership: "Membership Enquiry",
  haulage: "Haulage / Freight",
  consultancy: "Consultancy",
  training: "Training",
  advocacy: "Advocacy / Policy",
  general: "General Enquiry",
};

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

function Skeleton({ className }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-gray-100", className)} />
  );
}

function StatusBadge({ status }) {
  const config = {
    unread: "bg-primary-50 text-primary-600 border-primary-100",
    read: "bg-gray-50 text-gray-500 border-gray-100",
    archived: "bg-amber-50 text-amber-600 border-amber-100",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-body font-semibold border",
        config[status] ?? config.read,
      )}
    >
      {status}
    </span>
  );
}

/* ─────────────────────────────────────────────
   MESSAGE LIST
───────────────────────────────────────────── */

function MessageListSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="p-3 rounded-xl space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

function MessageListItem({ message, isSelected, onClick }) {
  const isUnread = message.status === "unread";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left p-3.5 rounded-xl border transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
        isSelected
          ? "bg-primary-50 border-primary-200"
          : "bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          {isUnread && (
            <span
              className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0"
              aria-label="Unread"
            />
          )}
          <span
            className={cn(
              "font-body text-sm truncate",
              isUnread
                ? "font-semibold text-gray-900"
                : "font-medium text-gray-700",
            )}
          >
            {message.name}
          </span>
        </div>
        <span className="font-body text-2xs text-gray-400 flex-shrink-0">
          {formatRelativeTime(message.createdAt)}
        </span>
      </div>

      <p className="font-body text-xs font-medium text-gray-500 mb-1 truncate">
        {SUBJECT_LABELS[message.subject] ?? message.subject}
      </p>

      <p className="font-body text-xs text-gray-400 line-clamp-2 leading-relaxed">
        {message.message}
      </p>

      {message.repliedAt && (
        <div className="flex items-center gap-1 mt-2">
          <CheckCircle2 className="w-3 h-3 text-secondary-500" />
          <span className="font-body text-2xs text-secondary-600">Replied</span>
        </div>
      )}
    </button>
  );
}

function MessageList({ selectedId, onSelect, statusFilter, onStatusChange }) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: CONTACT_QUERY_KEYS.list({ status: statusFilter }),
    queryFn: () => contactService.getMessages({ status: statusFilter }),
    staleTime: 60 * 1000,
  });

  const messages = data?.data?.data ?? data?.data ?? [];
  const total = data?.data?.pagination?.total ?? messages.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-gray-900 text-base">
            Inbox
          </h2>
          <button
            type="button"
            onClick={() => {
              queryClient.invalidateQueries({
                queryKey: CONTACT_QUERY_KEYS.all,
              });
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            aria-label="Refresh inbox"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => onStatusChange(f.value)}
              className={cn(
                "px-2.5 py-1 rounded-lg font-body text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                statusFilter === f.value
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-100",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <MessageListSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 px-4">
            <AlertCircle className="w-8 h-8 text-gray-300" />
            <p className="font-body text-sm text-gray-400 text-center">
              Failed to load messages
            </p>
            <button
              type="button"
              onClick={refetch}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 px-4">
            <Inbox className="w-10 h-10 text-gray-200" />
            <p className="font-body text-sm text-gray-400 text-center">
              No messages{statusFilter ? ` in ${statusFilter}` : ""}
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-1.5">
            <p className="font-body text-2xs text-gray-400 px-1 mb-2">
              {total} message{total !== 1 ? "s" : ""}
            </p>
            {messages.map((msg) => (
              <MessageListItem
                key={msg._id}
                message={msg}
                isSelected={selectedId === msg._id}
                onClick={() => onSelect(msg._id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MESSAGE DETAIL
───────────────────────────────────────────── */

function MessageDetailSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-6 w-64" />
      <div className="flex gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

function ReplyForm({ messageId, onReplied }) {
  const [replyText, setReplyText] = useState("");
  const [sent, setSent] = useState(false);
  const queryClient = useQueryClient();

  const replyMutation = useMutation({
    mutationFn: () => contactService.replyToMessage(messageId, replyText),
    onSuccess: () => {
      setSent(true);
      setReplyText("");
      queryClient.invalidateQueries({
        queryKey: CONTACT_QUERY_KEYS.detail(messageId),
      });
      queryClient.invalidateQueries({ queryKey: CONTACT_QUERY_KEYS.all });
      onReplied?.();
    },
  });

  if (sent) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-xl bg-secondary-50 border border-secondary-100">
        <CheckCircle2 className="w-4 h-4 text-secondary-500 flex-shrink-0" />
        <p className="font-body text-sm text-secondary-700">
          Reply sent successfully.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor="reply-input"
        className="font-body text-sm font-medium text-gray-700"
      >
        Reply to sender
      </label>
      <textarea
        id="reply-input"
        rows={4}
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        placeholder="Type your reply…"
        className={cn(
          "w-full rounded-xl border border-gray-200 bg-white px-4 py-3",
          "font-body text-sm text-gray-900 placeholder:text-gray-400",
          "resize-none focus:outline-none focus:ring-2 focus:ring-primary-500",
          "focus:border-primary-500 transition-colors",
        )}
      />

      {replyMutation.isError && (
        <p className="font-body text-xs text-primary-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          Failed to send reply. Please try again.
        </p>
      )}

      <button
        type="button"
        onClick={() => replyMutation.mutate()}
        disabled={replyText.trim().length < 10 || replyMutation.isPending}
        className={cn(
          "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl",
          "font-body text-sm font-semibold text-white",
          "bg-primary-500 hover:bg-primary-600 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {replyMutation.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        Send Reply
      </button>
    </div>
  );
}

function MessageDetail({ messageId, onBack, onDeleted }) {
  const queryClient = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: CONTACT_QUERY_KEYS.detail(messageId),
    queryFn: () => contactService.getMessage(messageId),
    staleTime: 30 * 1000,
    enabled: !!messageId,
  });

  const archiveMutation = useMutation({
    mutationFn: () => contactService.archiveMessage(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACT_QUERY_KEYS.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => contactService.deleteMessage(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTACT_QUERY_KEYS.all });
      onDeleted?.();
    },
  });

  // Reset inline delete confirmation when switching messages
  const prevMessageId = useRef(messageId);

  if (prevMessageId.current !== messageId) {
    prevMessageId.current = messageId;
    setDeleteConfirm(false);
  }

  const message = data?.data ?? data;

  if (isLoading) return <MessageDetailSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle className="w-8 h-8 text-gray-300" />
        <p className="font-body text-sm text-gray-400">
          Failed to load message
        </p>
        <button
          type="button"
          onClick={refetch}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

  if (!message) return null;

  const isArchived = message.status === "archived";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          {/* Back button — mobile only */}
          <button
            type="button"
            onClick={onBack}
            className="lg:hidden flex items-center gap-1.5 font-body text-sm text-gray-500 hover:text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <StatusBadge status={message.status} />

            {/* Archive */}
            {!isArchived && (
              <button
                type="button"
                onClick={() => archiveMutation.mutate()}
                disabled={archiveMutation.isPending}
                title="Archive"
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  "text-gray-400 hover:text-amber-600 hover:bg-amber-50",
                  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                  "disabled:opacity-50",
                )}
              >
                {archiveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Archive className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Delete */}
            {deleteConfirm ? (
              <div className="flex items-center gap-1.5">
                <span className="font-body text-xs text-gray-500">Delete?</span>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className={cn(
                    "px-2.5 py-1 rounded-lg font-body text-xs font-semibold",
                    "bg-primary-500 text-white hover:bg-primary-600 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                    "disabled:opacity-50",
                  )}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "Yes, delete"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg font-body text-xs font-medium",
                    "text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400",
                  )}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                disabled={deleteMutation.isPending}
                title="Delete"
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  "text-gray-400 hover:text-primary-600 hover:bg-primary-50",
                  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
                  "disabled:opacity-50",
                )}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Sender info */}
        <div>
          <h3 className="font-display font-bold text-gray-900 text-lg leading-snug mb-3">
            {SUBJECT_LABELS[message.subject] ?? message.subject}
          </h3>

          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-body text-xs text-gray-400">From</span>
              <span className="font-body text-sm font-medium text-gray-900">
                {message.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-gray-400" />

              <a
                href={`mailto:${message.email}`}
                className="font-body text-sm text-primary-600 hover:underline"
              >
                {message.email}
              </a>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-body text-xs text-gray-400">
                {new Date(message.createdAt).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Message body */}
        <div>
          <p className="font-body text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {message.message}
          </p>
        </div>

        {/* Replied indicator */}
        {message.repliedAt && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-secondary-50 border border-secondary-100">
            <CheckCircle2 className="w-4 h-4 text-secondary-500 flex-shrink-0" />
            <p className="font-body text-xs text-secondary-700">
              Replied {formatRelativeTime(message.repliedAt)}
            </p>
          </div>
        )}

        <hr className="border-gray-100" />

        {/* Reply form */}
        <ReplyForm messageId={messageId} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   EMPTY STATE
───────────────────────────────────────────── */

function EmptyDetailState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
      <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center">
        <MailOpen className="w-6 h-6 text-gray-300" />
      </div>
      <div>
        <p className="font-display font-bold text-gray-900 text-base">
          Select a message
        </p>
        <p className="font-body text-sm text-gray-400 mt-1">
          Choose a message from the list to read and reply
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   PAGE
───────────────────────────────────────────── */

export default function AdminInboxPage() {
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState(undefined);
  const [showDetail, setShowDetail] = useState(false);

  function handleSelect(id) {
    setSelectedId(id);
    setShowDetail(true);
  }

  function handleBack() {
    setShowDetail(false);
  }

  function handleDeleted() {
    setSelectedId(null);
    setShowDetail(false);
  }

  return (
    <div className="max-w-6xl h-[calc(100vh-8rem)] flex flex-col">
      <div className="mb-4 flex-shrink-0">
        <h1 className="font-display font-bold text-gray-900 text-2xl sm:text-3xl">
          Inbox
        </h1>
        <p className="font-body text-gray-400 text-sm mt-1">
          Contact form submissions from the public website
        </p>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-gray-100 overflow-hidden flex min-h-0">
        {/* Left panel — message list */}
        <div
          className={cn(
            "w-full lg:w-80 xl:w-96 border-r border-gray-100 flex flex-col flex-shrink-0",
            // On mobile, hide list when detail is showing
            showDetail ? "hidden lg:flex" : "flex",
          )}
        >
          <MessageList
            selectedId={selectedId}
            onSelect={handleSelect}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
          />
        </div>

        {/* Right panel — detail */}
        <div
          className={cn(
            "flex-1 flex flex-col min-w-0",
            showDetail ? "flex" : "hidden lg:flex",
          )}
        >
          <AnimatePresence mode="wait">
            {selectedId ? (
              <motion.div
                key={selectedId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col h-full"
              >
                <MessageDetail
                  messageId={selectedId}
                  onBack={handleBack}
                  onDeleted={handleDeleted}
                />
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1"
              >
                <EmptyDetailState />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
