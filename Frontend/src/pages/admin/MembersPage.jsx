/**
 * @file pages/admin/MembersPage.jsx
 * @module pages/admin
 *
 * Members management page — all members across all statuses.
 *
 * Tabs: All · Active · Rejected · Suspended · Deleted
 *
 * Actions per status:
 *  Active    → View, Suspend, Soft Delete
 *  Pending   → View, Approve, Reject, Soft Delete
 *  Rejected  → View, Soft Delete
 *  Suspended → View, Reinstate, Soft Delete
 *  Deleted   → View, Hard Delete (locked for 90-day grace period)
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  ShieldOff,
  ShieldCheck,
  Eye,
  MoreHorizontal,
  Download,
  Skull,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react";
import adminService, {
  ADMIN_QUERY_KEYS,
} from "../../services/admin.service.js";

/* ─── constants ──────────────────────────────────────────────────────────── */

const TABS = [
  { key: "all", label: "All", color: "text-slate-600" },
  { key: "active", label: "Active", color: "text-emerald-600" },
  { key: "pending", label: "Pending", color: "text-amber-600" },
  { key: "rejected", label: "Rejected", color: "text-red-600" },
  { key: "suspended", label: "Suspended", color: "text-orange-600" },
  { key: "deleted", label: "Deleted", color: "text-slate-400" },
];

const GRACE_PERIOD_DAYS = 90;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

/* ─── helpers ────────────────────────────────────────────────────────────── */

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRelative(d) {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

function graceDaysRemaining(deletedAt) {
  if (!deletedAt) return GRACE_PERIOD_DAYS;
  const elapsed = Date.now() - new Date(deletedAt).getTime();
  const remaining = Math.ceil((GRACE_PERIOD_MS - elapsed) / 86400000);
  return Math.max(remaining, 0);
}

function StatusBadge({ status }) {
  const map = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    suspended: "bg-orange-50 text-orange-700 border-orange-200",
    deleted: "bg-slate-100 text-slate-500 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${map[status] ?? "bg-slate-100 text-slate-500 border-slate-200"}`}
    >
      {status}
    </span>
  );
}

/* ─── Confirm modal ──────────────────────────────────────────────────────── */

function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  confirmClass,
  requireReason,
  loading,
}) {
  const [reason, setReason] = useState("");
  const isValid = !requireReason || reason.trim().length >= 10;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-100">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500 mt-1">{description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {requireReason && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Reason <span className="text-red-500">*</span>
              <span className="text-slate-400 font-normal ml-1">
                (min 10 characters)
              </span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Provide a reason..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 resize-none"
            />
            <p className="text-xs text-slate-400 mt-1">{reason.length} / 500</p>
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!isValid || loading}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${confirmClass}`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Member detail modal ────────────────────────────────────────────────── */

function MemberDetailModal({ member, onClose }) {
  if (!member) return null;
  const profile = member.profile;

  const fields = [
    { label: "Email", value: member.email },
    { label: "Status", value: <StatusBadge status={member.status} /> },
    { label: "Business Name", value: profile?.businessName ?? "—" },
    { label: "Contact Person", value: profile?.contactPerson ?? "—" },
    { label: "Member Since", value: formatDate(member.createdAt) },
    { label: "Approved", value: formatDate(member.approvedAt) },
    { label: "Rejected", value: formatDate(member.rejectedAt) },
    { label: "Suspended", value: formatDate(member.suspendedAt) },
    { label: "Deleted", value: formatDate(member.deletedAt) },
  ].filter(({ value }) => value !== "—" && value !== null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-100 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Member Profile
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{member.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="divide-y divide-slate-50">
          {fields.map(({ label, value }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 py-2.5"
            >
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex-shrink-0 w-28">
                {label}
              </span>
              <span className="text-sm text-slate-800 text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Action menu ────────────────────────────────────────────────────────── */

function ActionMenu({
  member,
  onView,
  onApprove,
  onReject,
  onSuspend,
  onReinstate,
  onSoftDelete,
  onHardDelete,
  onExport,
}) {
  const [open, setOpen] = useState(false);
  const status = member.status;
  const daysLeft = graceDaysRemaining(member.deletedAt);
  const canHardDelete = status === "deleted" && daysLeft === 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-48 text-sm">
            <button
              onClick={() => {
                setOpen(false);
                onView(member);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-slate-700"
            >
              <Eye className="w-3.5 h-3.5 text-slate-400" /> View Details
            </button>

            <button
              onClick={() => {
                setOpen(false);
                onExport(member);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-slate-700"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" /> Export Data
            </button>

            {/* ── Pending actions ── */}
            {status === "pending" && (
              <>
                <div className="mx-3 my-1 border-t border-slate-100" />
                <button
                  onClick={() => {
                    setOpen(false);
                    onApprove(member);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-emerald-50 text-emerald-600"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    onReject(member);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-red-50 text-red-600"
                >
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </>
            )}

            {/* ── Active actions ── */}
            {status === "active" && (
              <button
                onClick={() => {
                  setOpen(false);
                  onSuspend(member);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-orange-50 text-orange-600"
              >
                <ShieldOff className="w-3.5 h-3.5" /> Suspend
              </button>
            )}

            {/* ── Suspended actions ── */}
            {status === "suspended" && (
              <button
                onClick={() => {
                  setOpen(false);
                  onReinstate(member);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-emerald-50 text-emerald-600"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Reinstate
              </button>
            )}

            {/* ── Soft delete (all non-deleted) ── */}
            {status !== "deleted" && (
              <button
                onClick={() => {
                  setOpen(false);
                  onSoftDelete(member);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-red-50 text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Member
              </button>
            )}

            {/* ── Hard delete (deleted only) ── */}
            {status === "deleted" && (
              <button
                onClick={() => {
                  if (canHardDelete) {
                    setOpen(false);
                    onHardDelete(member);
                  }
                }}
                disabled={!canHardDelete}
                title={
                  !canHardDelete
                    ? `Hard delete available in ${daysLeft} day(s)`
                    : "Permanently delete"
                }
                className={`w-full flex items-center gap-2.5 px-3 py-2 ${canHardDelete ? "hover:bg-red-50 text-red-700" : "text-slate-300 cursor-not-allowed"}`}
              >
                <Skull className="w-3.5 h-3.5" />
                {canHardDelete ? "Permanent Delete" : `Locked (${daysLeft}d)`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Skeleton row ───────────────────────────────────────────────────────── */

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

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function MembersPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [viewMember, setViewMember] = useState(null);
  const [modal, setModal] = useState(null); // { type, member }

  const limit = 20;

  /* ── Query ── */
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ADMIN_QUERY_KEYS.members.list({ status: activeTab, page, limit }),
    queryFn: () =>
      adminService.getMembers({
        status: activeTab === "all" ? undefined : activeTab,
        page,
        limit,
      }),
    keepPreviousData: true,
  });

  const members = (data?.data ?? []).filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.email?.toLowerCase().includes(q) ||
      m.profile?.businessName?.toLowerCase().includes(q) ||
      m.profile?.contactPerson?.toLowerCase().includes(q)
    );
  });

  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? (Math.ceil(total / limit) || 1);

  /* ── Mutations ── */
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.members.all });
    queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.memberStats });
  };

  const approveMutation = useMutation({
    mutationFn: ({ id }) => adminService.approveMember(id),
    onSuccess: () => {
      setModal(null);
      invalidate();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => adminService.rejectMember(id, reason),
    onSuccess: () => {
      setModal(null);
      invalidate();
    },
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }) => adminService.suspendMember(id, reason),
    onSuccess: () => {
      setModal(null);
      invalidate();
    },
  });

  const reinstateMutation = useMutation({
    mutationFn: ({ id }) => adminService.reinstateMember(id),
    onSuccess: () => {
      setModal(null);
      invalidate();
    },
  });

  const softDeleteMutation = useMutation({
    mutationFn: ({ id, reason }) => adminService.softDeleteMember(id, reason),
    onSuccess: () => {
      setModal(null);
      invalidate();
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: ({ id }) => adminService.hardDeleteMember(id),
    onSuccess: () => {
      setModal(null);
      invalidate();
    },
  });

  /* ── Export ── */
  const handleExport = (member) => {
    const exportData = {
      email: member.email,
      status: member.status,
      businessName: member.profile?.businessName ?? "",
      contactPerson: member.profile?.contactPerson ?? "",
      memberSince: member.createdAt,
      approvedAt: member.approvedAt ?? null,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `member-${member._id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Tab change ── */
  const handleTabChange = (key) => {
    setActiveTab(key);
    setPage(1);
    setSearch("");
  };

  /* ── Modal helpers ── */
  const closeModal = () => setModal(null);

  const modalConfig = {
    approve: {
      title: "Approve Member",
      description: `Approve ${modal?.member?.email}? Their account will become active.`,
      confirmLabel: "Approve",
      confirmClass: "bg-emerald-600 hover:bg-emerald-700",
      requireReason: false,
      onConfirm: () => approveMutation.mutate({ id: modal.member._id }),
      loading: approveMutation.isPending,
    },
    reject: {
      title: "Reject Application",
      description: `Reject ${modal?.member?.email}'s application?`,
      confirmLabel: "Reject",
      confirmClass: "bg-red-600 hover:bg-red-700",
      requireReason: true,
      onConfirm: (reason) =>
        rejectMutation.mutate({ id: modal.member._id, reason }),
      loading: rejectMutation.isPending,
    },
    suspend: {
      title: "Suspend Member",
      description: `Suspend ${modal?.member?.email}? They will lose access immediately.`,
      confirmLabel: "Suspend",
      confirmClass: "bg-orange-600 hover:bg-orange-700",
      requireReason: true,
      onConfirm: (reason) =>
        suspendMutation.mutate({ id: modal.member._id, reason }),
      loading: suspendMutation.isPending,
    },
    reinstate: {
      title: "Reinstate Member",
      description: `Reinstate ${modal?.member?.email}? Their account will be restored to active.`,
      confirmLabel: "Reinstate",
      confirmClass: "bg-emerald-600 hover:bg-emerald-700",
      requireReason: false,
      onConfirm: () => reinstateMutation.mutate({ id: modal.member._id }),
      loading: reinstateMutation.isPending,
    },
    softDelete: {
      title: "Delete Member",
      description: `Move ${modal?.member?.email} to deleted. Data is retained for 90 days before permanent deletion is permitted.`,
      confirmLabel: "Delete Member",
      confirmClass: "bg-red-600 hover:bg-red-700",
      requireReason: true,
      onConfirm: (reason) =>
        softDeleteMutation.mutate({ id: modal.member._id, reason }),
      loading: softDeleteMutation.isPending,
    },
    hardDelete: {
      title: "⚠️ Permanently Delete Member",
      description: `This will permanently wipe all data for ${modal?.member?.email}. This cannot be undone. Are you absolutely sure?`,
      confirmLabel: "Permanently Delete",
      confirmClass: "bg-red-700 hover:bg-red-800",
      requireReason: false,
      onConfirm: () => hardDeleteMutation.mutate({ id: modal.member._id }),
      loading: hardDeleteMutation.isPending,
    },
  };

  const activeModal = modal ? modalConfig[modal.type] : null;

  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-400" />
              Members
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Manage all member accounts
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 bg-white border border-slate-200 rounded-xl p-1 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab.key
                  ? "bg-slate-900 text-white shadow-sm"
                  : `text-slate-500 hover:text-slate-700 hover:bg-slate-50 ${tab.color}`
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-5 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or business…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  {["Member", "Status", "Joined", "Last Action", ""].map(
                    (h, i) => (
                      <th
                        key={i}
                        className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide ${i === 4 ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(8)].map((_, i) => <SkeletonRow key={i} />)
                ) : isError ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-slate-500"
                    >
                      <AlertCircle className="w-6 h-6 mx-auto mb-2 text-red-400" />
                      Failed to load members.
                    </td>
                  </tr>
                ) : members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-16 text-center text-slate-400"
                    >
                      <Users className="w-8 h-8 mx-auto mb-3 opacity-40" />
                      <p className="font-medium text-slate-500">
                        No members found
                      </p>
                      <p className="text-xs mt-1">
                        {search
                          ? "Try adjusting your search"
                          : "No members in this category"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  members.map((member) => {
                    const daysLeft = graceDaysRemaining(member.deletedAt);
                    const lastAction =
                      member.deletedAt ??
                      member.suspendedAt ??
                      member.rejectedAt ??
                      member.approvedAt ??
                      member.createdAt;

                    return (
                      <tr
                        key={member._id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                      >
                        {/* Member */}
                        <td className="px-4 py-3.5">
                          <div>
                            <p className="font-medium text-slate-800 text-sm">
                              {member.email}
                            </p>
                            {member.profile?.businessName && (
                              <p className="text-xs text-slate-400 mt-0.5">
                                {member.profile.businessName}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <div className="space-y-1">
                            <StatusBadge status={member.status} />
                            {member.status === "deleted" && daysLeft > 0 && (
                              <p className="text-2xs text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Hard delete in {daysLeft}d
                              </p>
                            )}
                            {member.status === "deleted" && daysLeft === 0 && (
                              <p className="text-2xs text-red-500 font-medium">
                                Ready for permanent delete
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Joined */}
                        <td className="px-4 py-3.5 text-sm text-slate-500">
                          {formatDate(member.createdAt)}
                        </td>

                        {/* Last action */}
                        <td className="px-4 py-3.5 text-sm text-slate-500">
                          {formatRelative(lastAction)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right">
                          <ActionMenu
                            member={member}
                            onView={setViewMember}
                            onApprove={(m) =>
                              setModal({ type: "approve", member: m })
                            }
                            onReject={(m) =>
                              setModal({ type: "reject", member: m })
                            }
                            onSuspend={(m) =>
                              setModal({ type: "suspend", member: m })
                            }
                            onReinstate={(m) =>
                              setModal({ type: "reinstate", member: m })
                            }
                            onSoftDelete={(m) =>
                              setModal({ type: "softDelete", member: m })
                            }
                            onHardDelete={(m) =>
                              setModal({ type: "hardDelete", member: m })
                            }
                            onExport={handleExport}
                          />
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
                of {total.toLocaleString()}
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

      {/* Detail modal */}
      {viewMember && (
        <MemberDetailModal
          member={viewMember}
          onClose={() => setViewMember(null)}
        />
      )}

      {/* Action confirm modal */}
      {modal && activeModal && (
        <ConfirmModal
          open={!!modal}
          onClose={closeModal}
          onConfirm={activeModal.onConfirm}
          title={activeModal.title}
          description={activeModal.description}
          confirmLabel={activeModal.confirmLabel}
          confirmClass={activeModal.confirmClass}
          requireReason={activeModal.requireReason}
          loading={activeModal.loading}
        />
      )}
    </div>
  );
}
