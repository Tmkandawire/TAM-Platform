/**
 * @file pages/member/ProfilePage.jsx
 * @module pages/member
 *
 * Member profile management page.
 *
 * Sections:
 *  1. Page header — business name, status badge, last updated
 *  2. Sticky status sidebar — completion state, approval lock notice,
 *     submit-for-verification CTA
 *  3. Form sections:
 *     01 — Business Information (businessName, registrationNumber, taxId,
 *                                membershipType)
 *     02 — Contact Details (contactPerson, phoneNumber, physicalAddress, city)
 *     03 — Fleet Information (fleetSize, vehicleTypes)
 *
 * Behaviour:
 *  - Read mode by default; Edit button unlocks the form
 *  - Form is fully locked once profile.isApproved === true (backend enforces,
 *    frontend reflects with a visual lock state and helpful message)
 *  - Zod validation mirrors the backend updateProfileSchema exactly
 *  - On save: PATCH /members/profile → invalidates MEMBER_QUERY_KEYS.profile
 *  - Submit for verification: POST /members/submit → shown only when
 *    isComplete === true && !isApproved && documents.length > 0
 *  - useBlocker prevents navigation away while the form has unsaved changes
 *  - useReducedMotion() respected throughout
 *
 * Data:
 *  - GET /api/v1/members/me via MEMBER_QUERY_KEYS.profile (shared cache)
 *  - PATCH /api/v1/members/profile ← update (existing profile)
 *  - POST /api/v1/members/submit
 *
 * Note: Profile creation is handled during onboarding (/onboarding).
 *  By the time a member reaches this page, a profile is guaranteed to exist.
 */

import { useState, useEffect, useCallback } from "react";
import { Link, useBlocker } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  Edit3,
  X,
  Save,
  Lock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Building2,
  Phone,
  MapPin,
  Truck,
  Send,
  RefreshCw,
  FileText,
} from "lucide-react";
import memberService, {
  MEMBER_QUERY_KEYS,
} from "../../services/member.service.js";
import {
  formatDate,
  formatDateTime,
  DOCUMENT_TYPE_LABELS,
} from "../../utils/formatters.js";
import { cn } from "../../utils/cn.js";
import ProfilePictureUpload from "../../components/member/ProfilePictureUpload.jsx";

// ─── Constants (mirror backend memberDto.js) ──────────────────────────────────

const CITIES = ["Blantyre", "Lilongwe", "Mzuzu", "Zomba", "Other"];
const VEHICLE_TYPES = ["Truck", "Tanker", "Van", "Minibus", "Other"];
const MEMBERSHIP_TYPES = ["Small Scale", "Medium Scale", "Corporate"];

// ─── Validation schemas ───────────────────────────────────────────────────────

const MW_PHONE_REGEX = /^(?:\+265|0)[89]\d{8}$/;
const normalizePhone = (val) => val.replace(/[\s\-().]/g, "");

/** Mirrors backend updateProfileSchema — all fields optional for PATCH */
const profileUpdateSchema = z.object({
  businessName: z
    .string()
    .min(3, "Business name must be at least 3 characters")
    .max(100, "Business name must be at most 100 characters")
    .transform((v) => v.trim())
    .optional()
    .or(z.literal("")),

  contactPerson: z
    .string()
    .min(2, "Contact person must be at least 2 characters")
    .max(100, "Contact person must be at most 100 characters")
    .transform((v) => v.trim())
    .optional()
    .or(z.literal("")),

  phoneNumber: z
    .string()
    .transform(normalizePhone)
    .refine((val) => val === "" || MW_PHONE_REGEX.test(val), {
      message: "Enter a valid Malawian number (e.g. +265991234567)",
    })
    .optional()
    .or(z.literal("")),

  physicalAddress: z
    .string()
    .min(5, "Address must be at least 5 characters")
    .max(255, "Address must be at most 255 characters")
    .transform((v) => v.trim())
    .optional()
    .or(z.literal("")),

  city: z.enum([...CITIES, ""]).optional(),

  fleetSize: z.coerce
    .number()
    .int("Fleet size must be a whole number")
    .nonnegative("Fleet size cannot be negative")
    .optional(),

  vehicleTypes: z.array(z.enum(VEHICLE_TYPES)).optional(),
});

// ─── Animation variants ───────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 },
  }),
};

const reducedFadeUp = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0 } },
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-gray-100", className)} />
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

// ─── Form field primitives ────────────────────────────────────────────────────

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

function ReadValue({ value, placeholder = "Not provided" }) {
  return (
    <p
      className={cn(
        "font-body text-sm py-2.5",
        value ? "text-gray-900" : "text-gray-400 italic",
      )}
    >
      {value || placeholder}
    </p>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function FormSection({ index, title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-50 bg-gray-50/50">
        <span className="font-display font-bold text-gray-300 text-xs tracking-[0.2em]">
          {String(index).padStart(2, "0")}
        </span>
        <div className="w-px h-4 bg-gray-200" aria-hidden="true" />
        <Icon
          className="w-4 h-4 text-gray-400 flex-shrink-0"
          aria-hidden="true"
        />
        <h2 className="font-display font-bold text-gray-900 text-sm">
          {title}
        </h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Vehicle type checkbox group ──────────────────────────────────────────────

function VehicleTypeCheckboxes({ value = [], onChange, disabled }) {
  const toggle = (type) => {
    if (disabled) return;
    const next = value.includes(type)
      ? value.filter((v) => v !== type)
      : [...value, type];
    onChange(next);
  };

  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Vehicle types"
    >
      {VEHICLE_TYPES.map((type) => {
        const selected = value.includes(type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            disabled={disabled}
            aria-pressed={selected}
            className={cn(
              "px-3 py-1.5 rounded-lg border font-body text-sm transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
              selected
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {type}
          </button>
        );
      })}
    </div>
  );
}

// ─── Status sidebar ───────────────────────────────────────────────────────────

function StatusSidebar({ profile, onSubmit, isSubmitting }) {
  const isComplete = profile?.isComplete ?? false;
  const isApproved = profile?.isApproved ?? false;
  const hasDocuments = (profile?.documents?.length ?? 0) > 0;

  const canSubmit = isComplete && !isApproved && hasDocuments;

  const completionItems = [
    {
      label: "Business info",
      done: Boolean(profile?.businessName && profile?.registrationNumber),
    },
    {
      label: "Contact details",
      done: Boolean(profile?.contactPerson && profile?.phoneNumber),
    },
    {
      label: "Fleet details",
      done: Boolean(profile?.fleetSize && profile?.vehicleTypes?.length > 0),
    },
    { label: "Documents uploaded", done: hasDocuments },
  ];

  const completedCount = completionItems.filter((i) => i.done).length;
  const percentage = Math.round(
    (completedCount / completionItems.length) * 100,
  );

  return (
    <div className="space-y-4">
      {/* Completion card */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display font-bold text-gray-900 text-sm">
            Completion
          </p>
          <span
            className={cn(
              "font-display font-bold text-lg leading-none",
              percentage === 100 ? "text-secondary-500" : "text-primary-500",
            )}
          >
            {percentage}%
          </span>
        </div>

        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden mb-4">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              percentage === 100 ? "bg-secondary-500" : "bg-primary-500",
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>

        <ul className="space-y-2">
          {completionItems.map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              {item.done ? (
                <CheckCircle2
                  className="w-3.5 h-3.5 text-secondary-500 flex-shrink-0"
                  aria-hidden="true"
                />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 flex-shrink-0" />
              )}
              <span
                className={cn(
                  "font-body text-xs",
                  item.done ? "text-gray-400" : "text-gray-600",
                )}
              >
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Submit for verification */}
      {!isApproved && (
        <div
          className={cn(
            "rounded-xl border p-5 space-y-3",
            canSubmit
              ? "bg-secondary-50 border-secondary-200"
              : "bg-gray-50 border-gray-100",
          )}
        >
          <div>
            <p className="font-display font-bold text-gray-900 text-sm">
              Submit for Verification
            </p>
            <p className="font-body text-xs text-gray-500 mt-1 leading-relaxed">
              {canSubmit
                ? "Your profile is complete. Submit to TAM for membership review."
                : "Complete all sections and upload documents before submitting."}
            </p>
          </div>

          {!hasDocuments && (
            <Link
              to="/member/documents"
              className={cn(
                "inline-flex items-center gap-1 font-body text-xs font-medium",
                "text-primary-600 hover:text-primary-700 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary-500 focus-visible:ring-offset-1 rounded",
              )}
            >
              Upload documents first
              <ChevronRight className="w-3 h-3" aria-hidden="true" />
            </Link>
          )}

          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || isSubmitting}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg",
              "font-body text-sm font-medium transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
              canSubmit && !isSubmitting
                ? "bg-secondary-500 text-white hover:bg-secondary-600 shadow-sm"
                : "bg-gray-100 text-gray-400 cursor-not-allowed",
            )}
          >
            {isSubmitting ? (
              <>
                <RefreshCw
                  className="w-4 h-4 animate-spin"
                  aria-hidden="true"
                />
                Submitting…
              </>
            ) : (
              <>
                <Send className="w-4 h-4" aria-hidden="true" />
                Submit to TAM
              </>
            )}
          </button>
        </div>
      )}

      {/* Approved state */}
      {isApproved && (
        <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-5">
          <div className="flex items-start gap-2.5">
            <CheckCircle2
              className="w-4 h-4 text-secondary-500 flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <p className="font-body font-semibold text-secondary-800 text-sm">
                Profile Approved
              </p>
              <p className="font-body text-xs text-secondary-600 mt-1 leading-relaxed">
                Your profile has been verified by TAM. Profile details are now
                locked.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Documents link */}
      <Link
        to="/member/documents"
        className={cn(
          "flex items-center justify-between p-4 rounded-xl",
          "bg-white border border-gray-100",
          "hover:border-gray-200 hover:shadow-sm transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
        )}
      >
        <div className="flex items-center gap-2.5">
          <FileText className="w-4 h-4 text-gray-400" aria-hidden="true" />
          <div>
            <p className="font-body text-sm font-medium text-gray-900">
              Documents
            </p>
            <p className="font-body text-xs text-gray-400">
              {profile?.documents?.length ?? 0} file
              {(profile?.documents?.length ?? 0) !== 1 ? "s" : ""} uploaded
            </p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300" aria-hidden="true" />
      </Link>
    </div>
  );
}

// ─── Profile form (update existing) ──────────────────────────────────────────

function ProfileForm({ profile, isEditing, onCancel, onSaved, onDirtyChange }) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      businessName: profile?.businessName ?? "",
      contactPerson: profile?.contactPerson ?? "",
      phoneNumber: profile?.phoneNumber ?? "",
      physicalAddress: profile?.physicalAddress ?? "",
      city: profile?.city ?? "",
      fleetSize: profile?.fleetSize ?? 0,
      vehicleTypes: profile?.vehicleTypes ?? [],
    },
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (profile) {
      reset({
        businessName: profile.businessName ?? "",
        contactPerson: profile.contactPerson ?? "",
        phoneNumber: profile.phoneNumber ?? "",
        physicalAddress: profile.physicalAddress ?? "",
        city: profile.city ?? "",
        fleetSize: profile.fleetSize ?? 0,
        vehicleTypes: profile.vehicleTypes ?? [],
      });
    }
  }, [profile, reset]);

  const updateMutation = useMutation({
    mutationFn: memberService.updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBER_QUERY_KEYS.profile });
      toast.success("Profile updated successfully.");
      onSaved();
    },
    onError: (error) => {
      toast.error(error.message ?? "Failed to update profile.");
    },
  });

  const onSubmit = (data) => {
    const payload = Object.fromEntries(
      Object.entries(data).filter(
        ([, v]) =>
          v !== "" && v !== undefined && !(Array.isArray(v) && v.length === 0),
      ),
    );
    updateMutation.mutate(payload);
  };

  const isLocked = profile?.isApproved ?? false;
  const isSaving = updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* ── 01 Business Information ────────────────────────────────────────── */}
      <FormSection index={1} title="Business Information" icon={Building2}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="businessName" required>
              Business Name
            </FieldLabel>
            {isEditing && !isLocked ? (
              <>
                <input
                  id="businessName"
                  type="text"
                  autoComplete="organization"
                  {...register("businessName")}
                  className={cn(
                    "w-full px-3 py-2.5 rounded-lg border font-body text-sm text-gray-900",
                    "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
                    "transition-colors duration-150",
                    errors.businessName
                      ? "border-primary-300 bg-primary-50/30"
                      : "border-gray-200 bg-white hover:border-gray-300",
                  )}
                />
                <FieldError message={errors.businessName?.message} />
              </>
            ) : (
              <ReadValue value={profile?.businessName} />
            )}
          </div>

          <div>
            <FieldLabel htmlFor="registrationNumber">
              Registration Number
            </FieldLabel>
            <ReadValue value={profile?.registrationNumber} />
          </div>

          <div>
            <FieldLabel htmlFor="taxId">TAX ID</FieldLabel>
            <ReadValue value={profile?.taxId} placeholder="Not provided" />
          </div>

          <div>
            <FieldLabel htmlFor="membershipType">Membership Type</FieldLabel>
            <ReadValue value={profile?.membershipType} />
          </div>
        </div>
      </FormSection>

      {/* ── 02 Contact Details ─────────────────────────────────────────────── */}
      <FormSection index={2} title="Contact Details" icon={Phone}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
          <div>
            <FieldLabel htmlFor="contactPerson" required>
              Contact Person
            </FieldLabel>
            {isEditing && !isLocked ? (
              <>
                <input
                  id="contactPerson"
                  type="text"
                  autoComplete="name"
                  {...register("contactPerson")}
                  className={cn(
                    "w-full px-3 py-2.5 rounded-lg border font-body text-sm text-gray-900",
                    "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
                    "transition-colors duration-150",
                    errors.contactPerson
                      ? "border-primary-300 bg-primary-50/30"
                      : "border-gray-200 bg-white hover:border-gray-300",
                  )}
                />
                <FieldError message={errors.contactPerson?.message} />
              </>
            ) : (
              <ReadValue value={profile?.contactPerson} />
            )}
          </div>

          <div>
            <FieldLabel htmlFor="phoneNumber" required>
              Phone Number
            </FieldLabel>
            {isEditing && !isLocked ? (
              <>
                <input
                  id="phoneNumber"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+265 991 234 567"
                  {...register("phoneNumber")}
                  className={cn(
                    "w-full px-3 py-2.5 rounded-lg border font-body text-sm text-gray-900",
                    "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
                    "transition-colors duration-150",
                    errors.phoneNumber
                      ? "border-primary-300 bg-primary-50/30"
                      : "border-gray-200 bg-white hover:border-gray-300",
                  )}
                />
                <FieldError message={errors.phoneNumber?.message} />
              </>
            ) : (
              <ReadValue value={profile?.phoneNumber} />
            )}
          </div>

          <div className="sm:col-span-2">
            <FieldLabel htmlFor="physicalAddress" required>
              Physical Address
            </FieldLabel>
            {isEditing && !isLocked ? (
              <>
                <textarea
                  id="physicalAddress"
                  rows={2}
                  autoComplete="street-address"
                  {...register("physicalAddress")}
                  className={cn(
                    "w-full px-3 py-2.5 rounded-lg border font-body text-sm text-gray-900 resize-none",
                    "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
                    "transition-colors duration-150",
                    errors.physicalAddress
                      ? "border-primary-300 bg-primary-50/30"
                      : "border-gray-200 bg-white hover:border-gray-300",
                  )}
                />
                <FieldError message={errors.physicalAddress?.message} />
              </>
            ) : (
              <ReadValue value={profile?.physicalAddress} />
            )}
          </div>

          <div>
            <FieldLabel htmlFor="city" required>
              City
            </FieldLabel>
            {isEditing && !isLocked ? (
              <>
                <select
                  id="city"
                  {...register("city")}
                  className={cn(
                    "w-full px-3 py-2.5 rounded-lg border font-body text-sm text-gray-900",
                    "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
                    "transition-colors duration-150 bg-white",
                    errors.city
                      ? "border-primary-300 bg-primary-50/30"
                      : "border-gray-200 hover:border-gray-300",
                  )}
                >
                  <option value="">Select city</option>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.city?.message} />
              </>
            ) : (
              <ReadValue value={profile?.city} />
            )}
          </div>
        </div>
      </FormSection>

      {/* ── 03 Fleet Information ───────────────────────────────────────────── */}
      <FormSection index={3} title="Fleet Information" icon={Truck}>
        <div className="space-y-5">
          <div className="max-w-xs">
            <FieldLabel htmlFor="fleetSize" required>
              Fleet Size
            </FieldLabel>
            {isEditing && !isLocked ? (
              <>
                <input
                  id="fleetSize"
                  type="number"
                  min={0}
                  {...register("fleetSize")}
                  className={cn(
                    "w-full px-3 py-2.5 rounded-lg border font-body text-sm text-gray-900",
                    "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
                    "transition-colors duration-150",
                    errors.fleetSize
                      ? "border-primary-300 bg-primary-50/30"
                      : "border-gray-200 bg-white hover:border-gray-300",
                  )}
                />
                <FieldError message={errors.fleetSize?.message} />
              </>
            ) : (
              <ReadValue
                value={
                  profile?.fleetSize != null
                    ? `${profile.fleetSize} vehicle${profile.fleetSize !== 1 ? "s" : ""}`
                    : null
                }
              />
            )}
          </div>

          <div>
            <FieldLabel required>Vehicle Types</FieldLabel>
            {isEditing && !isLocked ? (
              <>
                <Controller
                  name="vehicleTypes"
                  control={control}
                  render={({ field }) => (
                    <VehicleTypeCheckboxes
                      value={field.value}
                      onChange={field.onChange}
                      disabled={false}
                    />
                  )}
                />
                <FieldError message={errors.vehicleTypes?.message} />
              </>
            ) : (
              <ReadValue
                value={profile?.vehicleTypes?.join(", ") || null}
                placeholder="No vehicle types specified"
              />
            )}
          </div>
        </div>
      </FormSection>

      {/* ── Form actions ───────────────────────────────────────────────────── */}
      {isEditing && !isLocked && (
        <div className="flex items-center justify-end gap-3 pt-2 pb-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className={cn(
              "px-4 py-2.5 rounded-lg font-body text-sm font-medium",
              "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-gray-400 focus-visible:ring-offset-2",
              isSaving && "opacity-50 cursor-wait",
            )}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || !isDirty}
            className={cn(
              "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg",
              "font-body text-sm font-medium transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
              isSaving || !isDirty
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-900 text-white hover:bg-gray-800 shadow-sm",
            )}
          >
            {isSaving ? (
              <>
                <RefreshCw
                  className="w-4 h-4 animate-spin"
                  aria-hidden="true"
                />
                Saving…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" aria-hidden="true" />
                Save Changes
              </>
            )}
          </button>
        </div>
      )}
    </form>
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
          Failed to load profile
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

export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [formIsDirty, setFormIsDirty] = useState(false);
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();

  const variants = prefersReducedMotion ? reducedFadeUp : fadeUp;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isEditing &&
      formIsDirty &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      const confirmed = window.confirm(
        "You have unsaved changes. Leave and discard them?",
      );
      if (confirmed) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker]);

  const handleDirtyChange = useCallback((dirty) => {
    setFormIsDirty(dirty);
  }, []);

  const {
    data: profileData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: MEMBER_QUERY_KEYS.profile,
    queryFn: memberService.getProfile,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const profile = profileData?.data ?? profileData ?? null;
  const isLocked = profile?.isApproved ?? false;

  const submitMutation = useMutation({
    mutationFn: memberService.submitForVerification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MEMBER_QUERY_KEYS.all });
      toast.success(
        "Profile submitted to TAM for review. You will be notified once reviewed.",
        { duration: 6000 },
      );
    },
    onError: (error) => {
      toast.error(error.message ?? "Submission failed. Please try again.");
    },
  });

  const handleCancelEdit = () => {
    setIsEditing(false);
    setFormIsDirty(false);
  };

  const handleSaved = () => {
    setIsEditing(false);
    setFormIsDirty(false);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) return <ProfileSkeleton />;

  // ── Error ──────────────────────────────────────────────────────────────────
  if (isError) return <ErrorState onRetry={refetch} />;

  // ── Render ─────────────────────────────────────────────────────────────────
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
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <motion.div
        variants={variants}
        custom={0}
        className="flex items-start justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          {/* Profile picture — always visible, never locked */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-200 bg-gray-100 flex items-center justify-center">
                {profile?.profilePicture ? (
                  <img
                    src={profile.profilePicture}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="font-display font-bold text-gray-400 text-xl">
                    {profile?.contactPerson?.[0]?.toUpperCase() ?? "?"}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div>
            <h1 className="font-display font-bold text-gray-900 text-2xl sm:text-3xl">
              {profile?.businessName ?? "My Profile"}
            </h1>
            <p className="font-body text-gray-400 text-sm mt-1">
              {profile?.updatedAt
                ? `Last updated ${formatDateTime(profile.updatedAt)}`
                : "Profile not yet saved"}
            </p>
          </div>
        </div>

        {/* Edit / lock toggle */}
        {!isLocked ? (
          isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                "font-body text-sm font-medium text-gray-600",
                "bg-white border border-gray-200 hover:border-gray-300",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-gray-400 focus-visible:ring-offset-2",
              )}
            >
              <X className="w-4 h-4" aria-hidden="true" />
              Cancel Editing
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg",
                "font-body text-sm font-medium text-white",
                "bg-gray-900 hover:bg-gray-800",
                "transition-colors duration-150 shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-gray-900 focus-visible:ring-offset-2",
              )}
            >
              <Edit3 className="w-4 h-4" aria-hidden="true" />
              Edit Profile
            </button>
          )
        ) : (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 border border-gray-200">
            <Lock className="w-4 h-4 text-gray-400" aria-hidden="true" />
            <span className="font-body text-sm text-gray-500">
              Profile Locked
            </span>
          </div>
        )}
      </motion.div>

      {/* ── Locked notice ─────────────────────────────────────────────────── */}
      {isLocked && (
        <motion.div
          variants={variants}
          custom={1}
          className="flex items-start gap-3 px-4 py-3.5 rounded-xl bg-secondary-50 border border-secondary-200"
          role="status"
        >
          <CheckCircle2
            className="w-4 h-4 text-secondary-500 flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="font-body text-sm text-secondary-700 leading-relaxed">
            Your profile has been verified and approved by TAM. Profile details
            are locked to preserve membership integrity. Contact TAM directly if
            you need to update your information.
          </p>
        </motion.div>
      )}

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Form column */}
        <motion.div
          variants={variants}
          custom={2}
          className="lg:col-span-2 space-y-4"
        >
          <ProfileForm
            profile={profile}
            isEditing={isEditing}
            onCancel={handleCancelEdit}
            onSaved={handleSaved}
            onDirtyChange={handleDirtyChange}
          />
        </motion.div>

        {/* Sidebar column */}
        <motion.div
          variants={variants}
          custom={3}
          className="lg:sticky lg:top-6"
        >
          <StatusSidebar
            profile={profile}
            onSubmit={() => submitMutation.mutate()}
            isSubmitting={submitMutation.isPending}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}
