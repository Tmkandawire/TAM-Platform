/**
 * @file pages/admin/BroadcastPage.jsx
 * @module pages/admin
 *
 * Broadcast compose and send page.
 *
 * Features:
 *  - Audience selector: ALL members or FILTERED subset
 *  - Filtered audience: by account status and/or membership type
 *  - Live preview panel
 *  - Idempotency key auto-generated (crypto.randomUUID()) per compose session
 *    to prevent duplicate sends on accidental double-submit or retry
 *  - Success state with delivery summary
 *
 * Data flow:
 *  POST /admin/broadcasts → { title, subject, message, audienceType, filters, idempotencyKey }
 */

import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Megaphone,
  Users,
  Filter,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Mail,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import adminService from "../../services/admin.service.js";

/* ─── constants ──────────────────────────────────────────────────────────── */

const STATUS_FILTERS = [
  { value: "active", label: "Active members" },
  { value: "pending", label: "Pending approval" },
  { value: "suspended", label: "Suspended accounts" },
];

const MEMBERSHIP_FILTERS = [
  { value: "ordinary", label: "Ordinary" },
  { value: "associate", label: "Associate" },
  { value: "honorary", label: "Honorary" },
];

function generateKey() {
  return crypto.randomUUID();
}

/* ─── Preview panel ──────────────────────────────────────────────────────── */

function PreviewPanel({ title, subject, message, audienceType, filters }) {
  const audienceLabel =
    audienceType === "ALL"
      ? "All members"
      : [
          ...(filters.status?.map(
            (s) => STATUS_FILTERS.find((f) => f.value === s)?.label ?? s,
          ) ?? []),
          ...(filters.membershipType?.map(
            (m) => MEMBERSHIP_FILTERS.find((f) => f.value === m)?.label ?? m,
          ) ?? []),
        ].join(", ") || "No audience selected";

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4 flex items-center gap-2">
        <Eye className="w-3.5 h-3.5" />
        Preview
      </h3>

      {/* Email preview mock */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="bg-slate-800 px-4 py-3 flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="ml-2 text-xs text-slate-400">Email preview</span>
        </div>
        <div className="p-4">
          <div className="mb-3 pb-3 border-b border-slate-100">
            <p className="text-xs text-slate-400 mb-0.5">Subject</p>
            <p className="text-sm font-semibold text-slate-800">
              {subject || (
                <span className="text-slate-300 font-normal italic">
                  No subject
                </span>
              )}
            </p>
          </div>
          <div className="mb-3 pb-3 border-b border-slate-100">
            <p className="text-xs text-slate-400 mb-0.5">Title</p>
            <p className="text-base font-bold text-slate-900">
              {title || (
                <span className="text-slate-300 font-normal text-sm italic">
                  No title
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1.5">Message</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {message || (
                <span className="text-slate-300 italic">No message body</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Audience summary */}
      <div className="mt-4 flex items-start gap-2 text-xs text-slate-500">
        <Users className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          <span className="font-medium text-slate-700">Audience: </span>
          {audienceLabel}
        </span>
      </div>
    </div>
  );
}

/* ─── Success state ──────────────────────────────────────────────────────── */

function SuccessState({ result, onReset }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-96 text-center p-8">
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
        <CheckCircle className="w-8 h-8 text-emerald-600" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1">
        Broadcast Sent
      </h2>
      <p className="text-sm text-slate-500 mb-6 max-w-xs">
        Your message is being delivered. Notifications are live — emails are
        processing in the background.
      </p>

      {result && (
        <div className="grid grid-cols-1 gap-4 mb-8 w-full max-w-xs">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
            <p className="text-xl font-bold text-slate-900">
              {result.recipientCount ?? "—"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Recipients</p>
          </div>
        </div>
      )}

      <button
        onClick={onReset}
        className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        Send Another
      </button>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function BroadcastPage() {
  const [form, setForm] = useState({
    title: "",
    subject: "",
    message: "",
    audienceType: "ALL",
    filters: {
      status: [],
      membershipType: [],
    },
  });
  const [showFilters, setShowFilters] = useState(false);
  const [successResult, setSuccessResult] = useState(null);

  // Idempotency key — regenerated on every new compose session / reset
  const idempotencyKey = useRef(generateKey());

  const mutation = useMutation({
    mutationFn: (payload) => adminService.sendBroadcast(payload),
    onSuccess: (res) => {
      setSuccessResult(res?.data ?? res ?? {});
    },
    onError: () => {
      idempotencyKey.current = generateKey();
    },
  });

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleFilter = useCallback((group, value) => {
    setForm((prev) => {
      const current = prev.filters[group] ?? [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, filters: { ...prev.filters, [group]: updated } };
    });
  }, []);

  const isValid =
    form.title.trim().length > 0 &&
    form.subject.trim().length > 0 &&
    form.message.trim().length > 0 &&
    (form.audienceType === "ALL" ||
      form.filters.status.length > 0 ||
      form.filters.membershipType.length > 0);

  const handleSubmit = () => {
    if (!isValid) return;
    const payload = {
      title: form.title.trim(),
      subject: form.subject.trim(),
      message: form.message.trim(),
      audienceType: form.audienceType,
      idempotencyKey: idempotencyKey.current,
      sendToAllUsers: form.audienceType === "ALL",
    };
    if (form.audienceType === "FILTERED") {
      payload.audienceFilters = {
        ...(form.filters.status.length > 0 && {
          statuses: form.filters.status,
        }),
        ...(form.filters.membershipType.length > 0 && {
          roles: form.filters.membershipType,
        }),
      };
    }
    mutation.mutate(payload);
  };

  const handleReset = () => {
    setForm({
      title: "",
      subject: "",
      message: "",
      audienceType: "ALL",
      filters: { status: [], membershipType: [] },
    });
    setSuccessResult(null);
    mutation.reset();
    idempotencyKey.current = generateKey();
  };

  /* ── Success state ── */
  if (successResult !== null) {
    return (
      <div className="min-h-full bg-slate-50">
        <div className="bg-white border-b border-slate-200 px-6 py-5">
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-slate-400" />
            Broadcast
          </h1>
        </div>
        <div className="p-6 max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            <SuccessState result={successResult} onReset={handleReset} />
          </div>
        </div>
      </div>
    );
  }

  /* ── Compose ── */
  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-slate-400" />
            Send Broadcast
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Compose and send a message to members
          </p>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto">
        {/* API error */}
        {mutation.isError && (
          <div className="mb-5 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {mutation.error?.message ?? "Failed to send broadcast. Try again."}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Compose form — wider */}
          <div className="lg:col-span-3 space-y-5">
            {/* Audience */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                Audience
              </h2>
              <div className="flex gap-2 mb-4">
                {["ALL", "FILTERED"].map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setField("audienceType", type);
                      if (type === "FILTERED") setShowFilters(true);
                    }}
                    className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${
                      form.audienceType === type
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {type === "ALL" ? "All Members" : "Filtered"}
                  </button>
                ))}
              </div>

              {form.audienceType === "FILTERED" && (
                <div>
                  <button
                    onClick={() => setShowFilters((p) => !p)}
                    className="flex items-center justify-between w-full text-sm text-slate-600 hover:text-slate-900 py-2 border-t border-slate-100 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Filter className="w-3.5 h-3.5" />
                      Filter options
                    </span>
                    {showFilters ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {showFilters && (
                    <div className="mt-3 space-y-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          By Account Status
                        </p>
                        <div className="space-y-1.5">
                          {STATUS_FILTERS.map((f) => (
                            <label
                              key={f.value}
                              className="flex items-center gap-2.5 cursor-pointer group"
                            >
                              <input
                                type="checkbox"
                                checked={form.filters.status.includes(f.value)}
                                onChange={() => toggleFilter("status", f.value)}
                                className="w-4 h-4 rounded border-slate-300 text-slate-800 focus:ring-slate-900/20"
                              />
                              <span className="text-sm text-slate-700">
                                {f.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          By Membership Type
                        </p>
                        <div className="space-y-1.5">
                          {MEMBERSHIP_FILTERS.map((f) => (
                            <label
                              key={f.value}
                              className="flex items-center gap-2.5 cursor-pointer group"
                            >
                              <input
                                type="checkbox"
                                checked={form.filters.membershipType.includes(
                                  f.value,
                                )}
                                onChange={() =>
                                  toggleFilter("membershipType", f.value)
                                }
                                className="w-4 h-4 rounded border-slate-300 text-slate-800 focus:ring-slate-900/20"
                              />
                              <span className="text-sm text-slate-700">
                                {f.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Message compose */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-400" />
                Message
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setField("title", e.target.value)}
                    placeholder="e.g. AGM Notice 2026"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Email Subject <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.subject}
                    onChange={(e) => setField("subject", e.target.value)}
                    placeholder="e.g. TAM Annual General Meeting – Save the Date"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    Message Body <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setField("message", e.target.value)}
                    rows={8}
                    placeholder="Write your message here…"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 resize-y transition-all"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    {form.message.length} characters
                  </p>
                </div>
              </div>
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!isValid || mutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Broadcast
                </>
              )}
            </button>
          </div>

          {/* Preview — narrower */}
          <div className="lg:col-span-2">
            <div className="sticky top-6">
              <PreviewPanel
                title={form.title}
                subject={form.subject}
                message={form.message}
                audienceType={form.audienceType}
                filters={form.filters}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
