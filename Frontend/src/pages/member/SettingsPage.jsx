/**
 * @file pages/member/SettingsPage.jsx
 * @module pages/member
 *
 * Member settings page.
 *
 * Sections:
 *   1. Account      — contactPerson + phoneNumber, inline edit, approval lock
 *   2. Security     — password change, collapsible form
 *   3. Notifications — three preference toggles, optimistic updates
 *
 * All logic preserved from original. UI rebuilt with Tailwind to match the
 * app design system — clear buttons, correct hover states, user-friendly layout.
 */

import { useState, useReducer, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  User,
  Lock,
  Bell,
  Edit3,
  Save,
  X,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Monitor,
  Sun,
  Moon,
} from "lucide-react";
import { MEMBER_QUERY_KEYS } from "../../services/member.service.js";
import settingsService, {
  SETTINGS_QUERY_KEYS,
} from "../../services/settings.service.js";
import { cn } from "../../utils/cn.js";
import { useTheme } from "../../hooks/useTheme.js";
import ProfilePictureUpload from "../../components/member/ProfilePictureUpload.jsx";

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "account", label: "Account", icon: User },
  { id: "security", label: "Security", icon: Lock },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Appearance", icon: Monitor },
];

const PREF_CONFIG = [
  {
    key: "documentUpdates",
    label: "Document updates",
    description: "Notifications when a document is approved or rejected.",
  },
  {
    key: "accountAlerts",
    label: "Account alerts",
    description:
      "Status changes, verification milestones, and membership events.",
  },
  {
    key: "broadcasts",
    label: "TAM broadcasts",
    description: "Industry notices and announcements from the secretariat.",
  },
];

// ─── Reducers ─────────────────────────────────────────────────────────────────

const ACCOUNT_INITIAL = {
  editing: false,
  contactPerson: "",
  phoneNumber: "",
  errors: {},
};

function accountReducer(state, action) {
  switch (action.type) {
    case "OPEN":
      return {
        ...state,
        editing: true,
        contactPerson: action.contactPerson ?? "",
        phoneNumber: action.phoneNumber ?? "",
        errors: {},
      };
    case "CHANGE":
      return {
        ...state,
        [action.field]: action.value,
        errors: { ...state.errors, [action.field]: undefined },
      };
    case "SET_ERRORS":
      return { ...state, errors: action.errors };
    case "CLOSE":
      return ACCOUNT_INITIAL;
    default:
      return state;
  }
}

const PASSWORD_INITIAL = {
  open: false,
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
  errors: {},
  serverError: null,
  success: false,
};

function passwordReducer(state, action) {
  switch (action.type) {
    case "TOGGLE":
      return state.open
        ? PASSWORD_INITIAL
        : { ...PASSWORD_INITIAL, open: true };
    case "CHANGE":
      return {
        ...state,
        [action.field]: action.value,
        errors: { ...state.errors, [action.field]: undefined },
        serverError: null,
        success: false,
      };
    case "SET_ERRORS":
      return { ...state, errors: action.errors };
    case "SERVER_ERROR":
      return { ...state, serverError: action.message };
    case "SUCCESS":
      return { ...PASSWORD_INITIAL, success: true };
    default:
      return state;
  }
}

// ─── Validation (mirrors settingsDto.js) ──────────────────────────────────────

function validateAccountFields({ contactPerson, phoneNumber }) {
  const errors = {};
  if (contactPerson !== undefined) {
    const v = contactPerson.trim();
    if (v.length < 2) errors.contactPerson = "Must be at least 2 characters.";
    if (v.length > 100) errors.contactPerson = "Cannot exceed 100 characters.";
  }
  if (phoneNumber !== undefined) {
    const v = phoneNumber.trim();
    if (v && !/^\+?[0-9]{7,15}$/.test(v))
      errors.phoneNumber = "Must be 7–15 digits, optionally prefixed with +.";
  }
  return errors;
}

function validatePasswordFields({
  currentPassword,
  newPassword,
  confirmPassword,
}) {
  const errors = {};
  if (!currentPassword)
    errors.currentPassword = "Current password is required.";
  if (!newPassword || newPassword.length < 8)
    errors.newPassword = "Must be at least 8 characters.";
  else if (!/[A-Z]/.test(newPassword))
    errors.newPassword = "Must contain at least one uppercase letter.";
  else if (!/[a-z]/.test(newPassword))
    errors.newPassword = "Must contain at least one lowercase letter.";
  else if (!/[0-9]/.test(newPassword))
    errors.newPassword = "Must contain at least one number.";
  if (newPassword && confirmPassword && newPassword !== confirmPassword)
    errors.confirmPassword = "Passwords do not match.";
  if (currentPassword && newPassword && currentPassword === newPassword)
    errors.newPassword = "New password must differ from current password.";
  return errors;
}

// ─── Design primitives ────────────────────────────────────────────────────────

function FieldLabel({ htmlFor, children }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5"
    >
      {children}
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

function TextInput({
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  autoFocus,
}) {
  return (
    <div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          "w-full px-3 py-2.5 rounded-lg border font-body text-sm text-gray-900",
          "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
          "transition-colors duration-150",
          error
            ? "border-primary-300 bg-primary-50/30"
            : "border-gray-200 bg-white hover:border-gray-300",
        )}
      />
      <FieldError message={error} />
    </div>
  );
}

/** Primary action button — always clearly visible with bg fill */
function PrimaryButton({ onClick, disabled, children, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg",
        "font-body text-sm font-medium transition-all duration-150 shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
        disabled
          ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
          : "bg-gray-900 text-white hover:bg-gray-700 active:bg-gray-800",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Secondary/ghost button — bordered, never disappears on hover */
function SecondaryButton({ onClick, disabled, children, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg",
        "font-body text-sm font-medium transition-all duration-150",
        "border border-gray-300 bg-white text-gray-700",
        "hover:bg-gray-50 hover:border-gray-400 hover:text-gray-900",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-gray-400 focus-visible:ring-offset-2",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Clearly visible Edit button — filled background so non-tech users see it */
function EditButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
        "font-body text-sm font-medium transition-all duration-150",
        "bg-gray-100 text-gray-700 border border-gray-200",
        "hover:bg-gray-200 hover:text-gray-900 hover:border-gray-300",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-gray-400 focus-visible:ring-offset-2",
      )}
    >
      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
      Edit
    </button>
  );
}

/** Toggle switch */
function ToggleSwitch({ on, onChange, disabled, reduced }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      className={cn(
        "relative w-11 h-6 rounded-full border-2 transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
        on
          ? "bg-secondary-500 border-secondary-500"
          : "bg-gray-200 border-gray-200",
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm",
          "transition-all",
          reduced ? "duration-0" : "duration-200",
          on ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}

/** Section card wrapper */
function SectionCard({
  id,
  icon: Icon,
  title,
  subtitle,
  headerAction,
  children,
}) {
  return (
    <section
      id={id}
      className="bg-white rounded-xl border border-gray-100 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-50 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <Icon
            className="w-4 h-4 text-gray-400 flex-shrink-0"
            aria-hidden="true"
          />
          <div>
            <h2 className="font-display font-bold text-gray-900 text-sm">
              {title}
            </h2>
            {subtitle && (
              <p className="font-body text-xs text-gray-400 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

/** Read-only field row */
function DisplayRow({ label, value, last }) {
  return (
    <div className={cn("py-3", !last && "border-b border-gray-50")}>
      <p className="font-body text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p
        className={cn(
          "font-body text-sm",
          value ? "text-gray-900" : "text-gray-400 italic",
        )}
      >
        {value || "Not set"}
      </p>
    </div>
  );
}

/** Form action row with Save + Cancel */
function FormActions({
  onSave,
  onCancel,
  isSaving,
  saveLabel = "Save Changes",
}) {
  return (
    <div className="flex items-center justify-end gap-3 pt-4 mt-4 border-t border-gray-100">
      <SecondaryButton onClick={onCancel} disabled={isSaving}>
        <X className="w-3.5 h-3.5" aria-hidden="true" />
        Cancel
      </SecondaryButton>
      <PrimaryButton onClick={onSave} disabled={isSaving}>
        {isSaving ? (
          <>
            <RefreshCw
              className="w-3.5 h-3.5 animate-spin"
              aria-hidden="true"
            />
            Saving…
          </>
        ) : (
          <>
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            {saveLabel}
          </>
        )}
      </PrimaryButton>
    </div>
  );
}

/** Approval lock notice */
function ApprovalLockNotice() {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-amber-50 border border-amber-200">
      <ShieldCheck
        className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <p className="font-body text-sm text-amber-700 leading-relaxed">
        Your profile has been approved. Contact the TAM secretariat to request
        changes.
      </p>
    </div>
  );
}

/** Success / error banner */
function InlineBanner({ type, children }) {
  const isSuccess = type === "success";
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-3 rounded-lg mb-4 font-body text-sm",
        isSuccess
          ? "bg-secondary-50 border border-secondary-200 text-secondary-700"
          : "bg-primary-50 border border-primary-200 text-primary-700",
      )}
    >
      {isSuccess ? (
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      )}
      {children}
    </div>
  );
}

// ─── Appearance section ──────────────────────────────────────────────────────

function AppearanceSection() {
  const { theme, toggleTheme } = useTheme();

  const options = [
    {
      value: "light",
      label: "Light",
      icon: Sun,
      description: "Default light interface.",
    },
    {
      value: "dark",
      label: "Dark",
      icon: Moon,
      description: "Easier on the eyes in low light.",
    },
  ];

  return (
    <SectionCard
      id="appearance"
      icon={Monitor}
      title="Appearance"
      subtitle="Choose your preferred colour scheme."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map(({ value, label, icon: Icon, description }) => {
          const isSelected = theme === value;
          return (
            <button
              key={value}
              type="button"
              // Only toggle if this option is NOT already selected
              onClick={() => {
                if (!isSelected) toggleTheme();
              }}
              aria-pressed={isSelected}
              className={cn(
                "flex items-start gap-4 p-4 rounded-xl border-2 text-left",
                "transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
                isSelected
                  ? "border-primary-500 bg-primary-50 dark:bg-primary-950/30"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
              )}
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                  isSelected
                    ? "bg-primary-500 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
                )}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "font-body text-sm font-semibold",
                    isSelected
                      ? "text-primary-700 dark:text-primary-400"
                      : "text-gray-900 dark:text-gray-100",
                  )}
                >
                  {label}
                </p>
                <p className="font-body text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {description}
                </p>
              </div>
              {isSelected && (
                <CheckCircle2
                  className="w-4 h-4 text-primary-500 flex-shrink-0 ml-auto mt-0.5"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ─── Sidebar nav ──────────────────────────────────────────────────────────────

function SettingsNav({ activeSection, onNav }) {
  return (
    <nav
      aria-label="Settings sections"
      className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-6"
    >
      {SECTIONS.map((s, i) => {
        const Icon = s.icon;
        const isActive = activeSection === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onNav(s.id)}
            style={{
              borderLeft: isActive
                ? "2px solid var(--tw-color-primary, #ef4444)"
                : "2px solid transparent",
              borderBottom:
                i < SECTIONS.length - 1 ? "1px solid #f9fafb" : "none",
              borderTop: "none",
              borderRight: "none",
            }}
            className={cn(
              "flex items-center gap-3 w-full px-4 py-3.5 text-left",
              "font-body text-sm font-medium transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary-500 focus-visible:ring-offset-0",
              isActive
                ? "bg-primary-50 text-primary-700"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
          >
            <Icon
              className={cn(
                "w-4 h-4 flex-shrink-0",
                isActive ? "text-primary-500" : "text-gray-400",
              )}
              aria-hidden="true"
            />
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const reduced = useReducedMotion();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState("account");
  const [accountLocked, setAccountLocked] = useState(false);

  const [accountState, dispatchAccount] = useReducer(
    accountReducer,
    ACCOUNT_INITIAL,
  );
  const [passwordState, dispatchPassword] = useReducer(
    passwordReducer,
    PASSWORD_INITIAL,
  );

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: profileData } = useQuery({
    queryKey: MEMBER_QUERY_KEYS.profile,
    queryFn: () =>
      import("../../services/member.service.js")
        .then((m) => m.default.getProfile())
        .then((r) => r?.data?.data ?? r?.data ?? r),
    staleTime: 60_000,
  });

  const profile = profileData?.data ?? profileData?.profile ?? profileData;

  const {
    data: prefsData,
    isLoading: prefsLoading,
    isError: prefsError,
  } = useQuery({
    queryKey: SETTINGS_QUERY_KEYS.notificationPrefs,
    queryFn: async () => {
      const r = await settingsService.getNotificationPrefs();
      // Axios interceptor may unwrap response.data automatically.
      // Backend returns: { statusCode, data: { notificationPreferences }, message }
      // After interceptor: r = { notificationPreferences } OR r = { data: { notificationPreferences } }
      const payload =
        r?.data?.notificationPreferences ??
        r?.notificationPreferences ??
        r?.data ??
        r;
      // React Query forbids returning undefined — fall back to empty defaults
      return (
        payload ?? {
          documentUpdates: true,
          accountAlerts: true,
          broadcasts: false,
        }
      );
    },
    staleTime: 60_000,
  });

  // prefs is the flat { documentUpdates, accountAlerts, broadcasts } object
  const prefs =
    prefsData?.documentUpdates !== undefined
      ? prefsData
      : (prefsData?.notificationPreferences ?? {
          documentUpdates: true,
          accountAlerts: true,
          broadcasts: false,
        });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const accountMutation = useMutation({
    mutationFn: (payload) => settingsService.updateAccountDetails(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBER_QUERY_KEYS.profile });
      dispatchAccount({ type: "CLOSE" });
      toast.success("Account details updated.");
    },
    onError: (err) => {
      if (err?.response?.status === 403) {
        setAccountLocked(true);
        dispatchAccount({ type: "CLOSE" });
      } else {
        toast.error(err?.message ?? "Failed to update account.");
      }
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (payload) => settingsService.changePassword(payload),
    onSuccess: () => {
      dispatchPassword({ type: "SUCCESS" });
      toast.success("Password updated successfully.");
    },
    onError: (err) => {
      const msg =
        err?.response?.data?.message ??
        "Something went wrong. Please try again.";
      dispatchPassword({ type: "SERVER_ERROR", message: msg });
    },
  });

  const prefsMutation = useMutation({
    mutationFn: (payload) => settingsService.updateNotificationPrefs(payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({
        queryKey: SETTINGS_QUERY_KEYS.notificationPrefs,
      });
      const prev = queryClient.getQueryData(
        SETTINGS_QUERY_KEYS.notificationPrefs,
      );
      queryClient.setQueryData(SETTINGS_QUERY_KEYS.notificationPrefs, (old) => {
        // old is the flat prefs object { documentUpdates, accountAlerts, broadcasts }
        // Must never return undefined — React Query will throw
        const base = old ?? {
          documentUpdates: true,
          accountAlerts: true,
          broadcasts: false,
        };
        return { ...base, ...payload };
      });
      return { prev };
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(
          SETTINGS_QUERY_KEYS.notificationPrefs,
          ctx.prev,
        );
      toast.error("Failed to update preferences.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: SETTINGS_QUERY_KEYS.notificationPrefs,
      });
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAccountSave = useCallback(() => {
    const payload = {};
    const cp = accountState.contactPerson.trim();
    const ph = accountState.phoneNumber.trim();
    if (cp !== (profile?.contactPerson ?? "")) payload.contactPerson = cp;
    if (ph !== (profile?.phoneNumber ?? "")) payload.phoneNumber = ph;
    if (Object.keys(payload).length === 0) {
      dispatchAccount({ type: "CLOSE" });
      return;
    }
    const errors = validateAccountFields(payload);
    if (Object.keys(errors).length > 0) {
      dispatchAccount({ type: "SET_ERRORS", errors });
      return;
    }
    accountMutation.mutate(payload);
  }, [accountState, profile, accountMutation]);

  const handlePasswordSave = useCallback(() => {
    const { currentPassword, newPassword, confirmPassword } = passwordState;
    const errors = validatePasswordFields({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (Object.keys(errors).length > 0) {
      dispatchPassword({ type: "SET_ERRORS", errors });
      return;
    }
    passwordMutation.mutate({
      currentPassword,
      newPassword,
      confirmNewPassword: confirmPassword,
    });
  }, [passwordState, passwordMutation]);

  const handleNavClick = useCallback((id) => {
    setActiveSection(id);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div>
        <h1 className="font-display font-bold text-gray-900 text-2xl sm:text-3xl">
          Settings
        </h1>
        <p className="font-body text-gray-400 text-sm mt-1">
          Manage your account, security, and notification preferences.
        </p>
      </div>

      {/* Body: sidebar + content */}
      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6 items-start">
        {/* Sidebar */}
        <SettingsNav activeSection={activeSection} onNav={handleNavClick} />

        {/* Content */}
        <div className="space-y-4">
          {/* ── 1. Account ─────────────────────────────────────────────────── */}
          <SectionCard
            id="account"
            icon={User}
            title="Account"
            subtitle="Your display name and contact details."
            headerAction={
              !accountState.editing && !accountLocked ? (
                <EditButton
                  onClick={() =>
                    dispatchAccount({
                      type: "OPEN",
                      contactPerson: profile?.contactPerson ?? "",
                      phoneNumber: profile?.phoneNumber ?? "",
                    })
                  }
                />
              ) : null
            }
          >
            {accountLocked ? (
              <ApprovalLockNotice />
            ) : accountState.editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel htmlFor="contactPerson">
                      Contact Person
                    </FieldLabel>
                    <TextInput
                      id="contactPerson"
                      value={accountState.contactPerson}
                      onChange={(v) =>
                        dispatchAccount({
                          type: "CHANGE",
                          field: "contactPerson",
                          value: v,
                        })
                      }
                      placeholder="Full name"
                      error={accountState.errors.contactPerson}
                      autoFocus
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="phoneNumber">Phone Number</FieldLabel>
                    <TextInput
                      id="phoneNumber"
                      value={accountState.phoneNumber}
                      onChange={(v) =>
                        dispatchAccount({
                          type: "CHANGE",
                          field: "phoneNumber",
                          value: v,
                        })
                      }
                      placeholder="+265 991 234 567"
                      error={accountState.errors.phoneNumber}
                    />
                  </div>
                </div>
                <FormActions
                  onSave={handleAccountSave}
                  onCancel={() => dispatchAccount({ type: "CLOSE" })}
                  isSaving={accountMutation.isPending}
                />
              </div>
            ) : (
              <div>
                <div className="mb-5 pb-5 border-b border-gray-50">
                  <ProfilePictureUpload
                    currentUrl={profile?.profilePicture ?? null}
                  />
                </div>

                <DisplayRow
                  label="Contact Person"
                  value={profile?.contactPerson}
                />

                <DisplayRow
                  label="Phone Number"
                  value={profile?.phoneNumber}
                  last
                />
              </div>
            )}
          </SectionCard>

          {/* ── 2. Security ────────────────────────────────────────────────── */}
          <SectionCard
            id="security"
            icon={Lock}
            title="Security"
            subtitle="Manage your login credentials."
            headerAction={
              <button
                type="button"
                onClick={() => dispatchPassword({ type: "TOGGLE" })}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                  "font-body text-sm font-medium transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-gray-400 focus-visible:ring-offset-2",
                  passwordState.open
                    ? "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
                    : "bg-gray-900 text-white hover:bg-gray-700 shadow-sm",
                )}
              >
                {passwordState.open ? (
                  <>
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    Cancel
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                    Change Password
                  </>
                )}
              </button>
            }
          >
            {passwordState.success && (
              <InlineBanner type="success">
                Password updated successfully.
              </InlineBanner>
            )}

            {!passwordState.open ? (
              <DisplayRow label="Password" value="••••••••••••" last />
            ) : (
              <div className="space-y-4">
                {passwordState.serverError && (
                  <InlineBanner type="error">
                    {passwordState.serverError}
                  </InlineBanner>
                )}
                <div>
                  <FieldLabel htmlFor="currentPassword">
                    Current Password
                  </FieldLabel>
                  <TextInput
                    id="currentPassword"
                    type="password"
                    value={passwordState.currentPassword}
                    onChange={(v) =>
                      dispatchPassword({
                        type: "CHANGE",
                        field: "currentPassword",
                        value: v,
                      })
                    }
                    placeholder="Enter your current password"
                    error={passwordState.errors.currentPassword}
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel htmlFor="newPassword">New Password</FieldLabel>
                    <TextInput
                      id="newPassword"
                      type="password"
                      value={passwordState.newPassword}
                      onChange={(v) =>
                        dispatchPassword({
                          type: "CHANGE",
                          field: "newPassword",
                          value: v,
                        })
                      }
                      placeholder="Min 8 characters"
                      error={passwordState.errors.newPassword}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="confirmPassword">
                      Confirm New Password
                    </FieldLabel>
                    <TextInput
                      id="confirmPassword"
                      type="password"
                      value={passwordState.confirmPassword}
                      onChange={(v) =>
                        dispatchPassword({
                          type: "CHANGE",
                          field: "confirmPassword",
                          value: v,
                        })
                      }
                      placeholder="Repeat new password"
                      error={passwordState.errors.confirmPassword}
                    />
                  </div>
                </div>
                <p className="font-body text-xs text-gray-400">
                  Must be at least 8 characters with uppercase, lowercase, and a
                  number.
                </p>
                <FormActions
                  onSave={handlePasswordSave}
                  onCancel={() => dispatchPassword({ type: "TOGGLE" })}
                  isSaving={passwordMutation.isPending}
                  saveLabel="Update Password"
                />
              </div>
            )}
          </SectionCard>

          {/* ── 3. Notifications ───────────────────────────────────────────── */}
          <SectionCard
            id="notifications"
            icon={Bell}
            title="Notifications"
            subtitle="Control which in-app alerts you receive."
          >
            {prefsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-36 animate-pulse rounded bg-gray-100" />
                      <div className="h-3 w-56 animate-pulse rounded bg-gray-100" />
                    </div>
                    <div className="h-6 w-11 animate-pulse rounded-full bg-gray-100" />
                  </div>
                ))}
              </div>
            ) : prefsError ? (
              <div className="flex items-center gap-2 py-2 font-body text-sm text-primary-600">
                <AlertCircle
                  className="w-4 h-4 flex-shrink-0"
                  aria-hidden="true"
                />
                Failed to load preferences. Refresh to try again.
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {PREF_CONFIG.map((pref) => (
                  <div
                    key={pref.key}
                    className="flex items-center justify-between gap-6 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="font-body text-sm font-medium text-gray-900">
                        {pref.label}
                      </p>
                      <p className="font-body text-xs text-gray-400 mt-0.5 leading-relaxed">
                        {pref.description}
                      </p>
                    </div>
                    <ToggleSwitch
                      on={prefs?.[pref.key] ?? false}
                      onChange={(val) =>
                        prefsMutation.mutate({ [pref.key]: val })
                      }
                      disabled={prefsMutation.isPending}
                      reduced={reduced}
                    />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* ── 4. Appearance ─────────────────────────────────────────────── */}
          <AppearanceSection />
        </div>
      </div>
    </div>
  );
}
