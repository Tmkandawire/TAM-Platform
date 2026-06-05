/**
 * @file pages/auth/OnboardingPage.jsx
 * @module pages/auth
 *
 * Post-registration onboarding wizard. Shown immediately after a user
 * creates their account (they are already authenticated with status "pending").
 *
 * Steps:
 *  1 — Business Information (businessName, registrationNumber, taxId,
 *                            membershipType)
 *  2 — Contact & Location   (contactPerson, phoneNumber, physicalAddress, city)
 *  3 — Fleet                (fleetSize, vehicleTypes)
 *  4 — Documents            (KYC file uploads + required date metadata)
 *
 * Document compliance rules (enforced by normalizeDocuments.js on backend):
 *  - nationalId  → expiryDate required
 *  - utilityBill → issueDate required, must be within last 3 months
 *  - passport, businessCert, tinCertificate → dates optional
 *
 * Date metadata is sent as FormData fields using the convention:
 *  ${fieldName}_expiryDate and ${fieldName}_issueDate
 *
 * On final submit: POST /api/v1/auth/onboarding/complete (multipart/form-data)
 * On success: navigate to /pending
 */

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import {
  Building2,
  Phone,
  Truck,
  FileText,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Upload,
  X,
  Sparkles,
  Calendar,
} from "lucide-react";
import authService from "../../services/auth.service.js";
import { cn } from "../../utils/cn.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const CITIES = ["Blantyre", "Lilongwe", "Mzuzu", "Zomba", "Other"];
const VEHICLE_TYPES = ["Truck", "Tanker", "Van", "Minibus", "Other"];
const MEMBERSHIP_TYPES = ["Small Scale", "Medium Scale", "Corporate"];

/**
 * KYC document fields — must match DOCUMENT_FIELDS in
 * cloudinaryUploadMiddleware.js exactly.
 *
 * requiresExpiryDate: backend enforces this — field will be rejected without it
 * requiresIssueDate:  backend enforces this — field will be rejected without it
 * issueMaxMonths:     frontend hint matching backend UTILITY_BILL_MAX_AGE_MONTHS
 */
const DOCUMENT_FIELDS = [
  {
    key: "nationalId",
    label: "National ID",
    required: true,
    hint: "Clear photo or scan of your Malawi National ID",
    requiresExpiryDate: true,
    requiresIssueDate: false,
  },
  {
    key: "businessCert",
    label: "Business Certificate",
    required: true,
    hint: "Company registration certificate from MBRS",
    requiresExpiryDate: false,
    requiresIssueDate: false,
  },
  {
    key: "tinCertificate",
    label: "TIN Certificate",
    required: false,
    hint: "Tax Identification Number certificate from MRA",
    requiresExpiryDate: false,
    requiresIssueDate: false,
  },
  {
    key: "utilityBill",
    label: "Utility Bill",
    required: false,
    hint: "Recent electricity or water bill (proof of address, max 3 months old)",
    requiresExpiryDate: false,
    requiresIssueDate: true,
    issueMaxMonths: 3,
  },
  {
    key: "passport",
    label: "Passport",
    required: false,
    hint: "Biographic data page of your passport",
    requiresExpiryDate: false,
    requiresIssueDate: false,
  },
];

// ─── Validation schemas ───────────────────────────────────────────────────────

const MW_PHONE_REGEX = /^(?:\+265|0)[89]\d{8}$/;
const normalizePhone = (val) => val.replace(/[\s\-().]/g, "");

const step1Schema = z.object({
  businessName: z
    .string()
    .min(3, "Business name must be at least 3 characters")
    .max(100, "Business name must be at most 100 characters")
    .transform((v) => v.trim()),
  registrationNumber: z
    .string()
    .min(3, "Registration number must be at least 3 characters")
    .max(50, "Registration number must be at most 50 characters")
    .transform((v) => v.trim()),
  taxId: z
    .string()
    .max(50, "Tax ID must be at most 50 characters")
    .transform((v) => v.trim())
    .optional()
    .or(z.literal("")),
  membershipType: z.enum(MEMBERSHIP_TYPES, {
    required_error: "Please select a membership type",
  }),
});

const step2Schema = z.object({
  contactPerson: z
    .string()
    .min(2, "Contact person must be at least 2 characters")
    .max(100, "Contact person must be at most 100 characters")
    .transform((v) => v.trim()),
  phoneNumber: z
    .string()
    .transform(normalizePhone)
    .refine((val) => MW_PHONE_REGEX.test(val), {
      message: "Enter a valid Malawian number (e.g. +265991234567)",
    }),
  physicalAddress: z
    .string()
    .min(5, "Address must be at least 5 characters")
    .max(255, "Address must be at most 255 characters")
    .transform((v) => v.trim()),
  city: z.enum(CITIES, { required_error: "Please select a city" }),
});

const step3Schema = z.object({
  fleetSize: z.coerce
    .number({ invalid_type_error: "Enter a number" })
    .int("Fleet size must be a whole number")
    .nonnegative("Fleet size cannot be negative"),
  vehicleTypes: z
    .array(z.enum(VEHICLE_TYPES))
    .min(1, "Select at least one vehicle type"),
});

const STEPS = [
  {
    id: 1,
    label: "Business Info",
    icon: Building2,
    schema: step1Schema,
    fields: ["businessName", "registrationNumber", "taxId", "membershipType"],
  },
  {
    id: 2,
    label: "Contact & Location",
    icon: Phone,
    schema: step2Schema,
    fields: ["contactPerson", "phoneNumber", "physicalAddress", "city"],
  },
  {
    id: 3,
    label: "Fleet",
    icon: Truck,
    schema: step3Schema,
    fields: ["fleetSize", "vehicleTypes"],
  },
  {
    id: 4,
    label: "Documents",
    icon: FileText,
    schema: null,
    fields: [],
  },
];

// ─── Animation variants ───────────────────────────────────────────────────────

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 32 : -32, opacity: 0 }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
  },
  exit: (dir) => ({
    x: dir > 0 ? -32 : 32,
    opacity: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
  }),
};

// ─── Field primitives ─────────────────────────────────────────────────────────

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

const inputClass = (hasError) =>
  cn(
    "w-full px-3 py-2.5 rounded-lg border font-body text-sm text-gray-900",
    "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent",
    "transition-colors duration-150",
    hasError
      ? "border-primary-300 bg-primary-50/30"
      : "border-gray-200 bg-white hover:border-gray-300",
  );

// ─── Vehicle type checkboxes ──────────────────────────────────────────────────

function VehicleTypeCheckboxes({ value = [], onChange }) {
  const toggle = (type) => {
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
            aria-pressed={selected}
            className={cn(
              "px-3 py-1.5 rounded-lg border font-body text-sm transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
              selected
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400",
            )}
          >
            {type}
          </button>
        );
      })}
    </div>
  );
}

// ─── Step 1: Business Information ─────────────────────────────────────────────

function Step1({ form }) {
  const {
    register,
    formState: { errors },
  } = form;
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel htmlFor="businessName" required>
          Business Name
        </FieldLabel>
        <input
          id="businessName"
          type="text"
          autoComplete="organization"
          placeholder="e.g. Kachale Transport Ltd"
          {...register("businessName")}
          className={inputClass(!!errors.businessName)}
        />
        <FieldError message={errors.businessName?.message} />
      </div>
      <div>
        <FieldLabel htmlFor="registrationNumber" required>
          Registration Number
        </FieldLabel>
        <input
          id="registrationNumber"
          type="text"
          placeholder="e.g. 12345678"
          {...register("registrationNumber")}
          className={inputClass(!!errors.registrationNumber)}
        />
        <FieldError message={errors.registrationNumber?.message} />
      </div>
      <div>
        <FieldLabel htmlFor="taxId">Tax ID (TIN)</FieldLabel>
        <input
          id="taxId"
          type="text"
          placeholder="Optional"
          {...register("taxId")}
          className={inputClass(!!errors.taxId)}
        />
        <FieldError message={errors.taxId?.message} />
      </div>
      <div>
        <FieldLabel htmlFor="membershipType" required>
          Membership Type
        </FieldLabel>
        <select
          id="membershipType"
          {...register("membershipType")}
          className={inputClass(!!errors.membershipType)}
        >
          <option value="">Select type…</option>
          {MEMBERSHIP_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <FieldError message={errors.membershipType?.message} />
      </div>
    </div>
  );
}

// ─── Step 2: Contact & Location ───────────────────────────────────────────────

function Step2({ form }) {
  const {
    register,
    formState: { errors },
  } = form;
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel htmlFor="contactPerson" required>
          Contact Person
        </FieldLabel>
        <input
          id="contactPerson"
          type="text"
          autoComplete="name"
          placeholder="Full name of main contact"
          {...register("contactPerson")}
          className={inputClass(!!errors.contactPerson)}
        />
        <FieldError message={errors.contactPerson?.message} />
      </div>
      <div>
        <FieldLabel htmlFor="phoneNumber" required>
          Phone Number
        </FieldLabel>
        <input
          id="phoneNumber"
          type="tel"
          autoComplete="tel"
          placeholder="+265 991 234 567"
          {...register("phoneNumber")}
          className={inputClass(!!errors.phoneNumber)}
        />
        <FieldError message={errors.phoneNumber?.message} />
      </div>
      <div>
        <FieldLabel htmlFor="physicalAddress" required>
          Physical Address
        </FieldLabel>
        <textarea
          id="physicalAddress"
          rows={2}
          autoComplete="street-address"
          placeholder="Street address, area"
          {...register("physicalAddress")}
          className={cn(inputClass(!!errors.physicalAddress), "resize-none")}
        />
        <FieldError message={errors.physicalAddress?.message} />
      </div>
      <div>
        <FieldLabel htmlFor="city" required>
          City
        </FieldLabel>
        <select
          id="city"
          {...register("city")}
          className={inputClass(!!errors.city)}
        >
          <option value="">Select city…</option>
          {CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <FieldError message={errors.city?.message} />
      </div>
    </div>
  );
}

// ─── Step 3: Fleet ────────────────────────────────────────────────────────────

function Step3({ form }) {
  const {
    register,
    control,
    formState: { errors },
  } = form;
  return (
    <div className="space-y-5">
      <div className="max-w-xs">
        <FieldLabel htmlFor="fleetSize" required>
          Fleet Size
        </FieldLabel>
        <input
          id="fleetSize"
          type="number"
          min={0}
          placeholder="0"
          {...register("fleetSize")}
          className={inputClass(!!errors.fleetSize)}
        />
        <FieldError message={errors.fleetSize?.message} />
      </div>
      <div>
        <FieldLabel required>Vehicle Types</FieldLabel>
        <Controller
          name="vehicleTypes"
          control={control}
          render={({ field }) => (
            <VehicleTypeCheckboxes
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <FieldError message={errors.vehicleTypes?.message} />
      </div>
    </div>
  );
}

// ─── Step 4: Document Upload ──────────────────────────────────────────────────

function Step4({
  files,
  dates,
  onFileChange,
  onFileRemove,
  onDateChange,
  fileErrors,
}) {
  return (
    <div className="space-y-5">
      <p className="font-body text-sm text-gray-500 leading-relaxed">
        Upload your KYC documents. Required documents are marked with{" "}
        <span className="text-primary-500">*</span>. Accepted formats: JPG, PNG,
        PDF (max 25 MB each).
      </p>

      {DOCUMENT_FIELDS.map((doc) => {
        const file = files[doc.key];
        const error = fileErrors[doc.key];
        const expiryError = fileErrors[`${doc.key}_expiryDate`];
        const issueError = fileErrors[`${doc.key}_issueDate`];

        return (
          <div key={doc.key} className="space-y-2">
            <FieldLabel htmlFor={doc.key} required={doc.required}>
              {doc.label}
            </FieldLabel>

            {file ? (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50">
                <FileText
                  className="w-4 h-4 text-gray-400 flex-shrink-0"
                  aria-hidden="true"
                />
                <span className="font-body text-sm text-gray-700 truncate flex-1">
                  {file.name}
                </span>
                <span className="font-body text-xs text-gray-400 flex-shrink-0">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  onClick={() => onFileRemove(doc.key)}
                  className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                  aria-label={`Remove ${doc.label}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label
                htmlFor={doc.key}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer",
                  "font-body text-sm transition-colors duration-150",
                  "focus-within:ring-2 focus-within:ring-primary-500",
                  error
                    ? "border-primary-300 bg-primary-50/30 text-primary-600"
                    : "border-dashed border-gray-300 bg-white text-gray-400 hover:border-gray-400 hover:text-gray-500",
                )}
              >
                <Upload className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                <span>{doc.hint}</span>
                <input
                  id={doc.key}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  className="sr-only"
                  onChange={(e) => onFileChange(doc.key, e.target.files[0])}
                />
              </label>
            )}

            <FieldError message={error} />

            {/* Expiry date — required for nationalId */}
            {(doc.requiresExpiryDate || (!doc.requiresExpiryDate && file)) &&
              doc.requiresExpiryDate && (
                <div>
                  <label
                    htmlFor={`${doc.key}_expiryDate`}
                    className="flex items-center gap-1.5 font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5"
                  >
                    <Calendar className="w-3 h-3" aria-hidden="true" />
                    Expiry Date
                    <span className="text-primary-500">*</span>
                  </label>
                  <input
                    id={`${doc.key}_expiryDate`}
                    type="date"
                    value={dates[`${doc.key}_expiryDate`] ?? ""}
                    onChange={(e) =>
                      onDateChange(`${doc.key}_expiryDate`, e.target.value)
                    }
                    className={inputClass(!!expiryError)}
                  />
                  <FieldError message={expiryError} />
                </div>
              )}

            {/* Issue date — required for utilityBill */}
            {doc.requiresIssueDate && (
              <div>
                <label
                  htmlFor={`${doc.key}_issueDate`}
                  className="flex items-center gap-1.5 font-body text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5"
                >
                  <Calendar className="w-3 h-3" aria-hidden="true" />
                  Issue Date
                  <span className="text-primary-500">*</span>
                  <span className="normal-case font-normal text-gray-400 ml-1">
                    (must be within last {doc.issueMaxMonths} months)
                  </span>
                </label>
                <input
                  id={`${doc.key}_issueDate`}
                  type="date"
                  value={dates[`${doc.key}_issueDate`] ?? ""}
                  onChange={(e) =>
                    onDateChange(`${doc.key}_issueDate`, e.target.value)
                  }
                  className={inputClass(!!issueError)}
                />
                <FieldError message={issueError} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ currentStep, steps }) {
  return (
    <nav aria-label="Onboarding progress" className="mb-8">
      <ol className="flex items-center gap-0">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isLast = idx === steps.length - 1;

          return (
            <li
              key={step.id}
              className="flex items-center flex-1 last:flex-none"
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300",
                    isCompleted
                      ? "bg-gray-900 text-white"
                      : isCurrent
                        ? "bg-primary-500 text-white shadow-md shadow-primary-200"
                        : "bg-gray-100 text-gray-400",
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  )}
                </div>
                <span
                  className={cn(
                    "font-body text-xs font-medium whitespace-nowrap",
                    isCurrent ? "text-gray-900" : "text-gray-400",
                  )}
                >
                  {step.label}
                </span>
              </div>

              {!isLast && (
                <div
                  className={cn(
                    "flex-1 h-px mx-3 mb-5 transition-colors duration-300",
                    isCompleted ? "bg-gray-900" : "bg-gray-200",
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [collectedData, setCollectedData] = useState({});
  const [files, setFiles] = useState({});
  const [dates, setDates] = useState({});
  const [fileErrors, setFileErrors] = useState({});

  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();

  const stepDef = STEPS[currentStep - 1];

  const form = useForm({
    resolver: stepDef.schema ? zodResolver(stepDef.schema) : undefined,
    values: {
      businessName: "",
      registrationNumber: "",
      taxId: "",
      membershipType: "",
      contactPerson: "",
      phoneNumber: "",
      physicalAddress: "",
      city: "",
      fleetSize: 0,
      vehicleTypes: [],
      ...collectedData,
    },
  });

  // ── File handlers ─────────────────────────────────────────────────────────

  const handleFileChange = useCallback((fieldKey, file) => {
    if (!file) return;
    setFiles((prev) => ({ ...prev, [fieldKey]: file }));
    setFileErrors((prev) => ({ ...prev, [fieldKey]: undefined }));
  }, []);

  const handleFileRemove = useCallback((fieldKey) => {
    setFiles((prev) => {
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  }, []);

  const handleDateChange = useCallback((dateKey, value) => {
    setDates((prev) => ({ ...prev, [dateKey]: value }));
    setFileErrors((prev) => ({ ...prev, [dateKey]: undefined }));
  }, []);

  // ── Validate document step ────────────────────────────────────────────────

  const validateDocuments = useCallback(() => {
    const errors = {};

    DOCUMENT_FIELDS.forEach((doc) => {
      // Required file missing
      if (doc.required && !files[doc.key]) {
        errors[doc.key] = `${doc.label} is required`;
      }

      // If file is present, check required date fields
      if (files[doc.key]) {
        if (doc.requiresExpiryDate && !dates[`${doc.key}_expiryDate`]) {
          errors[`${doc.key}_expiryDate`] =
            `Expiry date is required for ${doc.label}`;
        }
        if (doc.requiresIssueDate && !dates[`${doc.key}_issueDate`]) {
          errors[`${doc.key}_issueDate`] =
            `Issue date is required for ${doc.label}`;
        }
      }
    });

    setFileErrors(errors);
    return Object.keys(errors).length === 0;
  }, [files, dates]);

  // ── Submission mutation ───────────────────────────────────────────────────

  const onboardingMutation = useMutation({
    mutationFn: authService.completeOnboarding,
    onSuccess: () => {
      toast.success("Application submitted! We'll review it shortly.");
      navigate("/pending", { replace: true });
    },
    onError: (error) => {
      toast.error(error.message ?? "Submission failed. Please try again.");
    },
  });

  // ── Build and submit FormData ─────────────────────────────────────────────

  const submitOnboarding = useCallback(
    (allData) => {
      const formData = new FormData();

      console.log("FILES AT SUBMIT:", files);
      console.log("DATES AT SUBMIT:", dates);

      // Profile fields
      Object.entries(allData).forEach(([key, value]) => {
        if (key === "vehicleTypes" && Array.isArray(value)) {
          value.forEach((v) => formData.append("vehicleTypes", v));
        } else if (value !== undefined && value !== null && value !== "") {
          formData.append(key, String(value));
        }
      });

      // Document files
      Object.entries(files).forEach(([fieldKey, file]) => {
        formData.append(fieldKey, file);
      });

      // Date metadata — sent as ${fieldName}_expiryDate / ${fieldName}_issueDate
      // normalizeDocuments.js reads these by convention from req.body
      Object.entries(dates).forEach(([dateKey, value]) => {
        if (value) {
          formData.append(dateKey, value);
        }
      });

      onboardingMutation.mutate(formData);
    },
    [files, dates, onboardingMutation],
  );

  // ── Navigation ────────────────────────────────────────────────────────────

  const goNext = useCallback(
    form.handleSubmit((stepData) => {
      const merged = { ...collectedData, ...stepData };
      setCollectedData(merged);

      if (currentStep < STEPS.length) {
        setDirection(1);
        setCurrentStep((s) => s + 1);
      }
    }),
    [form, collectedData, currentStep],
  );

  const handleDocumentNext = useCallback(() => {
    if (!validateDocuments()) return;
    submitOnboarding(collectedData);
  }, [validateDocuments, submitOnboarding, collectedData]);

  const goBack = () => {
    const current = form.getValues();
    setCollectedData((prev) => ({ ...prev, ...current }));
    setDirection(-1);
    setCurrentStep((s) => s - 1);
  };

  const isLastStep = currentStep === STEPS.length;
  const isSubmitting = onboardingMutation.isPending;
  const handleNext = isLastStep ? handleDocumentNext : goNext;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-xl">
        {/* ── Page heading ─────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100 mb-4">
            <Sparkles
              className="w-3.5 h-3.5 text-primary-500"
              aria-hidden="true"
            />
            <span className="font-body text-xs font-semibold text-primary-600 uppercase tracking-wide">
              Getting started
            </span>
          </div>
          <h1 className="font-display font-bold text-gray-900 text-2xl sm:text-3xl">
            Complete Your Profile
          </h1>
          <p className="font-body text-gray-500 text-sm mt-1.5 leading-relaxed">
            Fill in your business details and upload your documents. Your
            application will be reviewed by the TAM secretariat.
          </p>
        </div>

        {/* ── Step indicator ────────────────────────────────────────────── */}
        <StepIndicator currentStep={currentStep} steps={STEPS} />

        {/* ── Step card ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {/* Card header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-50 bg-gray-50/50">
            <span className="font-display font-bold text-gray-300 text-xs tracking-[0.2em]">
              {String(currentStep).padStart(2, "0")}
            </span>
            <div className="w-px h-4 bg-gray-200" aria-hidden="true" />
            {(() => {
              const Icon = stepDef.icon;
              return (
                <Icon
                  className="w-4 h-4 text-gray-400 flex-shrink-0"
                  aria-hidden="true"
                />
              );
            })()}
            <h2 className="font-display font-bold text-gray-900 text-sm">
              {stepDef.label}
            </h2>
          </div>

          {/* Animated step content */}
          <div className="px-6 py-6 overflow-hidden">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={currentStep}
                custom={direction}
                variants={prefersReducedMotion ? {} : slideVariants}
                initial={prefersReducedMotion ? false : "enter"}
                animate="center"
                exit={prefersReducedMotion ? undefined : "exit"}
              >
                {currentStep === 1 && <Step1 form={form} />}
                {currentStep === 2 && <Step2 form={form} />}
                {currentStep === 3 && <Step3 form={form} />}
                {currentStep === 4 && (
                  <Step4
                    files={files}
                    dates={dates}
                    onFileChange={handleFileChange}
                    onFileRemove={handleFileRemove}
                    onDateChange={handleDateChange}
                    fileErrors={fileErrors}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Card footer — navigation */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-50 bg-gray-50/30">
            <button
              type="button"
              onClick={goBack}
              disabled={currentStep === 1 || isSubmitting}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg",
                "font-body text-sm font-medium transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-gray-400 focus-visible:ring-offset-2",
                currentStep === 1 || isSubmitting
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
              )}
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Back
            </button>

            {/* Step dots */}
            <div className="flex items-center gap-2" aria-hidden="true">
              {STEPS.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    s.id === currentStep
                      ? "w-6 bg-primary-500"
                      : s.id < currentStep
                        ? "w-1.5 bg-gray-900"
                        : "w-1.5 bg-gray-200",
                  )}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
              className={cn(
                "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg",
                "font-body text-sm font-medium transition-all duration-150 shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
                isSubmitting
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-gray-900 text-white hover:bg-gray-800",
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
              ) : isLastStep ? (
                <>
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  Submit Application
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>

        <p className="font-body text-xs text-gray-400 text-center mt-4">
          Step {currentStep} of {STEPS.length}
        </p>

        <p className="font-body text-xs text-gray-400 text-center mt-3">
          <a
            href="/"
            className="hover:text-gray-600 transition-colors underline underline-offset-2"
          >
            ← Back to TAM website
          </a>
        </p>
      </div>
    </div>
  );
}
