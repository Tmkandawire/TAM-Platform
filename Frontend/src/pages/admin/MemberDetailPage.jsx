/**
 * @file pages/admin/MemberDetailPage.jsx
 * @module pages/admin
 *
 * Single member detail view.
 *
 * Response shape (same endpoint as MembersPage):
 *  data[i] = {
 *    _id: string,          ← user ID for actions
 *    email: string,
 *    status: string,
 *    createdAt: string,
 *    profile: {
 *      businessName, registrationNumber, membershipType,
 *      city, physicalAddress, contactPerson, contactEmail,
 *      contactPhone, industry, documents: [...]
 *    }
 *  }
 */

import { useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  FileText,
  CheckCircle,
  XCircle,
  PauseCircle,
  ExternalLink,
  AlertCircle,
  Loader2,
  User,
  Hash,
  Globe,
  Clock,
  Shield,
} from "lucide-react";
import adminService, {
  ADMIN_QUERY_KEYS,
} from "../../services/admin.service.js";

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

const DOC_TYPE_LABELS = {
  nationalId: "National ID",
  passport: "Passport",
  utilityBill: "Utility Bill",
  businessCert: "Business Certificate",
  tinCertificate: "TIN Certificate",
};

const DOC_STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  resubmission_required: "bg-orange-100 text-orange-800 border-orange-200",
  expired: "bg-slate-100 text-slate-600 border-slate-200",
};

const MEMBER_STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  suspended: "bg-slate-100 text-slate-600",
};

function ActionModal({
  type,
  businessName,
  email,
  onConfirm,
  onClose,
  isPending,
}) {
  const [reason, setReason] = useState("");

  const config = {
    approve: {
      icon: <CheckCircle className="w-5 h-5 text-emerald-600" />,
      iconBg: "bg-emerald-100",
      title: "Approve Application",
      description:
        "The member's account will be activated. They will be notified immediately.",
      requiresReason: false,
      buttonLabel: "Approve",
      buttonClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
    },
    reject: {
      icon: <XCircle className="w-5 h-5 text-red-600" />,
      iconBg: "bg-red-100",
      title: "Reject Application",
      description:
        "The application will be declined. A notification with your reason will be sent.",
      requiresReason: true,
      buttonLabel: "Reject",
      buttonClass: "bg-red-600 hover:bg-red-700 text-white",
    },
    suspend: {
      icon: <PauseCircle className="w-5 h-5 text-slate-600" />,
      iconBg: "bg-slate-100",
      title: "Suspend Account",
      description:
        "The member's access will be suspended. They will be notified with your reason.",
      requiresReason: true,
      buttonLabel: "Suspend",
      buttonClass: "bg-slate-800 hover:bg-slate-900 text-white",
    },
  }[type];

  const isValid = !config.requiresReason || reason.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-100">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${config.iconBg}`}
          >
            {config.icon}
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {config.title}
            </h2>
            <p className="text-sm text-slate-500">{businessName ?? email}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-5">{config.description}</p>
        {config.requiresReason && (
          <div className="mb-5">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Minimum 10 characters…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 resize-none transition-all"
            />
            <p className="text-xs text-slate-400 mt-1">
              {reason.trim().length} / 500
            </p>
          </div>
        )}
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
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${config.buttonClass}`}
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {config.buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <p className="text-sm text-slate-800 font-medium break-words">
          {value ?? "—"}
        </p>
      </div>
    </div>
  );
}

function DocumentCard({ doc }) {
  const statusStyle =
    DOC_STATUS_STYLES[doc.status] ?? DOC_STATUS_STYLES.pending;
  return (
    <div className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:border-slate-200 hover:bg-slate-50/50 transition-all">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-slate-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">
            {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${statusStyle}`}
            >
              {doc.status?.replace("_", " ") ?? "pending"}
            </span>
            {doc.uploadedAt && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(doc.uploadedAt)}
              </span>
            )}
          </div>
        </div>
      </div>
      {doc.url && (
        <a
          href={
            doc.url?.includes("/raw/upload/")
              ? doc.url.replace("/raw/upload/", "/raw/upload/fl_attachment/")
              : doc.url
          }
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors flex-shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          View
        </a>
      )}
    </div>
  );
}

export default function MemberDetailPage() {
  const { id } = useParams(); // id = user._id
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeModal, setActiveModal] = useState(null);
  const [actionError, setActionError] = useState(null);

  /* ── Fetch: get all pending, find by _id ── */
  const {
    data: memberData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ADMIN_QUERY_KEYS.members.detail(id),
    queryFn: async () => {
      const res = await adminService.getPendingMembers({ limit: 100 });
      const list = res?.data ?? [];
      const found = list.find((m) => m._id?.toString() === id);
      if (!found) throw new Error("Member not found");
      return found;
    },
  });

  // member._id = user ID, member.profile = profile object
  const member = memberData;
  const profile = member?.profile ?? {};
  const documents = profile.documents ?? [];

  /* ── Mutations ── */
  const makeMutation = (mutationFn) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useMutation({
      mutationFn,
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ADMIN_QUERY_KEYS.members.all,
        });
        setActiveModal(null);
        setActionError(null);
        navigate("/admin/members");
      },
      onError: (err) => setActionError(err.message ?? "Action failed."),
    });

  const approveMutation = makeMutation(() => adminService.approveMember(id));
  const rejectMutation = makeMutation((reason) =>
    adminService.rejectMember(id, reason),
  );
  const suspendMutation = makeMutation((reason) =>
    adminService.suspendMember(id, reason),
  );

  const isPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    suspendMutation.isPending;

  const handleConfirm = useCallback(
    (reason) => {
      if (activeModal === "approve") approveMutation.mutate();
      if (activeModal === "reject") rejectMutation.mutate(reason);
      if (activeModal === "suspend") suspendMutation.mutate(reason);
    },
    [activeModal],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError || !member) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-slate-600">Member not found.</p>
        <Link
          to="/admin/members"
          className="text-sm text-slate-500 underline underline-offset-2"
        >
          Back to members
        </Link>
      </div>
    );
  }

  const canApprove = member.status === "pending";
  const canReject = member.status === "pending";
  const canSuspend = member.status === "active";

  return (
    <div className="min-h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/admin/members")}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-semibold text-slate-900">
                {profile.businessName ?? member.email}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Member Detail</p>
            </div>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${MEMBER_STATUS_STYLES[member.status] ?? MEMBER_STATUS_STYLES.pending}`}
          >
            {member.status}
          </span>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto">
        {actionError && (
          <div className="mb-5 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {actionError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Profile + Documents */}
          <div className="lg:col-span-2 space-y-5">
            {/* Business info */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                Business Information
              </h2>
              <InfoRow
                icon={Building2}
                label="Business Name"
                value={profile.businessName}
              />
              <InfoRow
                icon={Hash}
                label="Registration Number"
                value={profile.registrationNumber}
              />
              <InfoRow
                icon={Shield}
                label="Membership Type"
                value={
                  profile.membershipType
                    ? profile.membershipType.charAt(0).toUpperCase() +
                      profile.membershipType.slice(1)
                    : null
                }
              />

              <InfoRow icon={MapPin} label="City" value={profile.city} />
              <InfoRow
                icon={MapPin}
                label="Physical Address"
                value={profile.physicalAddress}
              />
              <InfoRow icon={Mail} label="Email" value={member.email} />
              <InfoRow
                icon={Calendar}
                label="Applied"
                value={formatDate(member.createdAt)}
              />
            </div>

            {/* Contact */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                Contact Person
              </h2>
              <InfoRow
                icon={User}
                label="Contact Name"
                value={profile.contactPerson}
              />
              <InfoRow icon={Mail} label="Contact Email" value={member.email} />
              <InfoRow icon={Phone} label="Phone" value={profile.phoneNumber} />
            </div>

            {/* Documents */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Uploaded Documents
                <span className="ml-auto text-xs font-normal text-slate-400">
                  {documents.length} document{documents.length !== 1 ? "s" : ""}
                </span>
              </h2>
              {documents.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  No documents uploaded.
                </p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <DocumentCard key={doc._id ?? doc.documentType} doc={doc} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sticky top-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">
                Admin Actions
              </h2>
              <div className="space-y-2.5">
                {canApprove && (
                  <button
                    onClick={() => setActiveModal("approve")}
                    disabled={isPending}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve Application
                  </button>
                )}
                {canReject && (
                  <button
                    onClick={() => setActiveModal("reject")}
                    disabled={isPending}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject Application
                  </button>
                )}
                {canSuspend && (
                  <button
                    onClick={() => setActiveModal("suspend")}
                    disabled={isPending}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <PauseCircle className="w-4 h-4" />
                    Suspend Account
                  </button>
                )}
                {!canApprove && !canReject && !canSuspend && (
                  <p className="text-xs text-slate-400 text-center py-4">
                    No actions available for this member's status.
                  </p>
                )}
              </div>

              {/* Summary */}
              <div className="mt-5 pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>Documents</span>
                  <span className="font-medium text-slate-700">
                    {documents.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Approved</span>
                  <span className="font-medium text-emerald-700">
                    {documents.filter((d) => d.status === "approved").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Pending</span>
                  <span className="font-medium text-amber-700">
                    {documents.filter((d) => d.status === "pending").length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeModal && (
        <ActionModal
          type={activeModal}
          businessName={profile.businessName}
          email={member.email}
          isPending={isPending}
          onClose={() => {
            setActiveModal(null);
            setActionError(null);
          }}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
