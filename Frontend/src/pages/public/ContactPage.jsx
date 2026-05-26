/**
 * @file ContactPage.jsx
 * @module pages/public
 *
 * TAM Contact Page — precision instrument aesthetic.
 *
 * Sections (top → bottom):
 *  1. Page Hero         — dark band, headline + availability signal
 *  2. Contact Body      — two-column: details card (left) + contact form (right)
 *  3. Membership CTA    — #membership anchor, 5-step process (linked from all CTAs)
 *  4. External Links    — 7 government/partner links, classification-index style
 *
 * Form:
 *  - Fields: name, email, subject, message
 *  - Submits via fetch() POST to /api/contact (SMTP handler)
 *  - Three UI states: idle → submitting → success | error
 *  - All fields validated client-side before submit
 *  - No external form library — plain controlled inputs
 *
 * Accessibility:
 *  - All inputs have associated <label> elements
 *  - aria-required, aria-invalid, aria-describedby on each field
 *  - Error messages linked via aria-describedby
 *  - Success/error status announced via role="status" aria-live="polite"
 *  - focus-visible rings on all interactive elements
 */

import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Clock,
  ChevronRight,
  Share2,
} from "lucide-react";

/*
 * Social platform icons are placeholders — all entries have url: null and are
 * never rendered until real URLs are configured. Share2 is used as a generic
 * stand-in because lucide-react's social brand icons (Facebook, Twitter,
 * Linkedin) are absent in older package versions. Swap these for real brand
 * icons (or an SVG sprite) once the accounts exist and the package version
 * is confirmed.
 */
const FacebookIcon = Share2;
const TwitterIcon = Share2;
const LinkedinIcon = Share2;
// react-router-dom Link used for internal TAM platform navigation
import { cn } from "../../utils/cn";

// ─── Shared primitives ────────────────────────────────────────────────────────

function FadeUp({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduced = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function SectionLabel({ children, light = false }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 mb-4",
        light ? "text-primary-300" : "text-primary-500",
      )}
    >
      <span className="inline-block w-8 h-0.5 bg-current rounded-full" />
      <span className="text-xs font-body font-semibold uppercase tracking-[0.18em]">
        {children}
      </span>
    </div>
  );
}

// ─── 1. Page Hero ─────────────────────────────────────────────────────────────

function PageHero() {
  return (
    <section className="relative bg-gray-950 overflow-hidden">
      {/* Background details */}
      <div className="absolute inset-0">
        {/* Vertical rule lines — instrument / blueprint feel */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent, transparent 80px, rgba(255,255,255,0.6) 80px, rgba(255,255,255,0.6) 81px)",
          }}
        />
        <div className="absolute bottom-0 right-0 w-[480px] h-[480px] rounded-full bg-primary-600 opacity-10 blur-[140px]" />
        <div className="absolute top-0 left-1/3 w-[280px] h-[280px] rounded-full bg-secondary-600 opacity-8 blur-[100px]" />
        {/* Green accent bar — right edge, contrasts with the red left-edge on ServicesPage */}
        <div className="absolute top-0 right-0 w-1 h-full bg-secondary-500" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left — headline */}
          <div>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-secondary-500/40 bg-secondary-500/10 mb-8"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-secondary-400 animate-pulse" />
              <span className="text-secondary-300 text-xs font-body font-medium tracking-wide">
                Get in Touch
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.7,
                delay: 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="font-display font-bold text-white leading-[1.05] tracking-tight mb-6"
              style={{ fontSize: "clamp(2.4rem, 5vw, 3.8rem)" }}
            >
              Let's Start a
              <span className="block text-secondary-400"> Conversation.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="font-body text-gray-300 text-base leading-relaxed max-w-md"
            >
              Whether you need freight haulage, want to join TAM, or have a
              consultancy enquiry — the Secretariat is ready to assist.
            </motion.p>
          </div>

          {/* Right — availability / office hours signal */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.35 }}
            className="grid sm:grid-cols-2 gap-4"
          >
            {/* Office hours card */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="w-9 h-9 rounded-lg bg-secondary-500/20 flex items-center justify-center mb-4">
                <Clock
                  className="w-4.5 h-4.5 text-secondary-400"
                  aria-hidden="true"
                />
              </div>
              <p className="font-body font-semibold text-white text-sm mb-1">
                Office Hours
              </p>
              <p className="font-body text-gray-400 text-xs leading-relaxed">
                Monday – Friday
                <br />
                08:00 – 17:00 CAT
              </p>
            </div>

            {/* Response time card */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="w-9 h-9 rounded-lg bg-primary-500/20 flex items-center justify-center mb-4">
                <Send className="w-4 h-4 text-primary-400" aria-hidden="true" />
              </div>
              <p className="font-body font-semibold text-white text-sm mb-1">
                Response Time
              </p>
              <p className="font-body text-gray-400 text-xs leading-relaxed">
                Within 1 business day
                <br />
                for all enquiries
              </p>
            </div>

            {/* Location quick card */}
            <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <MapPin
                    className="w-4 h-4 text-gray-400"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="font-body font-semibold text-white text-sm mb-1">
                    Secretariat Office
                  </p>
                  <p className="font-body text-gray-400 text-xs leading-relaxed">
                    TCC Complex, 1st Floor, Room 65
                    <br />
                    Kanengo Industrial Area, Lilongwe
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── 2. Contact Body ──────────────────────────────────────────────────────────

/**
 * Social media entries.
 * url: null = platform not yet active. Entries with null are never rendered
 * — avoids dead href="#" links that break screen readers and UX.
 */
const SOCIAL_LINKS = [
  { label: "Facebook", icon: FacebookIcon, url: null },
  { label: "Twitter / X", icon: TwitterIcon, url: null },
  { label: "LinkedIn", icon: LinkedinIcon, url: null },
];

/** Contact details rendered in the left details card. */
const CONTACT_DETAILS = [
  {
    icon: Phone,
    label: "Phone",
    items: [
      { display: "+265 891 003 936", href: "tel:+265891003936" },
      { display: "+265 981 003 936", href: "tel:+265981003936" },
    ],
    accentColor: "bg-secondary-500",
    hoverColor: "hover:text-secondary-400",
  },
  {
    icon: Mail,
    label: "Email",
    items: [
      {
        display: "info@transportersmw.com",
        href: "mailto:info@transportersmw.com",
      },
      {
        display: "admin@transportersmw.com",
        href: "mailto:admin@transportersmw.com",
      },
    ],
    accentColor: "bg-primary-500",
    hoverColor: "hover:text-primary-400",
  },
  {
    icon: MapPin,
    label: "Physical Address",
    items: [
      {
        display:
          "Kanengo Industrial Area\nTCC Complex, 1st Floor, Room 65\nLilongwe, Malawi",
        href: null,
      },
    ],
    accentColor: "bg-gray-500",
    hoverColor: null,
  },
];

/** Details card — left column of the contact body */
function ContactDetailsCard() {
  // Only render social platforms that have a real URL configured
  const activeSocials = SOCIAL_LINKS.filter(({ url }) => url !== null);

  return (
    <div className="flex flex-col gap-5">
      {/* Details */}
      {CONTACT_DETAILS.map(
        ({ icon: Icon, label, items, accentColor, hoverColor }) => (
          <div
            key={label}
            className="rounded-2xl border border-gray-100 bg-white p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                  accentColor,
                )}
              >
                <Icon className="w-4 h-4 text-white" aria-hidden="true" />
              </div>
              <span className="font-body font-semibold text-gray-900 text-sm">
                {label}
              </span>
            </div>
            <div className="space-y-1 pl-12">
              {items.map(({ display, href }) =>
                href ? (
                  <a
                    key={display}
                    href={href}
                    className={cn(
                      "block font-body text-gray-500 text-sm transition-colors duration-200",
                      "rounded focus-visible:outline-none focus-visible:ring-2",
                      "focus-visible:ring-primary-500 focus-visible:ring-offset-1",
                      hoverColor,
                    )}
                  >
                    {display}
                  </a>
                ) : (
                  /* Physical address — not a link, use address element */
                  <address
                    key={display}
                    className="not-italic font-body text-gray-500 text-sm leading-relaxed whitespace-pre-line"
                  >
                    {display}
                  </address>
                ),
              )}
            </div>
          </div>
        ),
      )}

      {/* Mailing address */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 px-6 py-4">
        <p className="font-body text-gray-400 text-xs uppercase tracking-widest mb-1">
          Mailing Address
        </p>
        <p className="font-body text-gray-600 text-sm">
          P.O. Box 40644, Kanengo, Lilongwe 4
        </p>
      </div>

      {/* Social icons — conditionally rendered */}
      {activeSocials.length > 0 && (
        <div>
          <p className="font-body text-gray-400 text-xs uppercase tracking-widest mb-3">
            Follow TAM
          </p>
          <div
            className="flex items-center gap-2"
            role="list"
            aria-label="Social media links"
          >
            {activeSocials.map(({ label, icon: Icon, url }) => (
              <a
                key={label}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                role="listitem"
                aria-label={`${label} (opens in new tab)`}
                className={cn(
                  "w-9 h-9 rounded-lg border border-gray-200 bg-white",
                  "flex items-center justify-center text-gray-400",
                  "hover:bg-primary-500 hover:text-white hover:border-primary-500",
                  "transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2",
                  "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
                )}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Contact Form ─────────────────────────────────────────────────────────────

/** Form field IDs — centralised to keep label htmlFor + input id in sync */
const FIELD_IDS = {
  name: "contact-name",
  email: "contact-email",
  subject: "contact-subject",
  message: "contact-message",
};

const SUBJECT_OPTIONS = [
  { value: "", label: "Select a subject…" },
  { value: "membership", label: "Membership Enquiry" },
  { value: "haulage", label: "Haulage / Freight Services" },
  { value: "consultancy", label: "Consultancy Request" },
  { value: "training", label: "Training Programs" },
  { value: "advocacy", label: "Advocacy / Policy" },
  { value: "general", label: "General Enquiry" },
];

/** Initial blank form state */
const INITIAL_FORM = { name: "", email: "", subject: "", message: "" };

/** Client-side validation — returns an object of field-level error strings */
function validateForm({ name, email, subject, message }) {
  const errors = {};
  if (!name.trim()) errors.name = "Full name is required.";
  if (!email.trim()) {
    errors.email = "Email address is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Please enter a valid email address.";
  }
  if (!subject) errors.subject = "Please select a subject.";
  if (!message.trim()) {
    errors.message = "Message is required.";
  } else if (message.trim().length < 20) {
    errors.message = "Message must be at least 20 characters.";
  }
  return errors;
}

/**
 * Reusable labelled input wrapper.
 * Wires up htmlFor → id, aria-required, aria-invalid, aria-describedby
 * so screen readers announce field state and error messages correctly.
 */
function FormField({ id, label, required = true, error, children }) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="font-body text-sm font-medium text-gray-700"
      >
        {label}
        {required && (
          <span className="text-primary-500 ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {/*
       * Clone the child input/textarea/select and inject accessibility props.
       * This keeps FormField generic — it doesn't need to know the element type.
       */}
      {children({ id, errorId, hasError: !!error })}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="font-body text-primary-500 text-xs flex items-center gap-1.5"
        >
          <AlertCircle
            className="w-3.5 h-3.5 flex-shrink-0"
            aria-hidden="true"
          />
          {error}
        </p>
      )}
    </div>
  );
}

/** Shared Tailwind class string for all text inputs and textarea */
const INPUT_BASE =
  "w-full rounded-xl border bg-white px-4 py-3 font-body text-sm text-gray-900 placeholder:text-gray-400 " +
  "transition-colors duration-200 " +
  "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 focus:border-primary-500 " +
  "focus-visible:ring-2 focus-visible:ring-primary-500";

/** The contact form with full validation and three submit states */
function ContactForm() {
  const [fields, setFields] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  // submitState: "idle" | "submitting" | "success" | "error"
  const [submitState, setSubmitState] = useState("idle");

  function handleChange(e) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
    // Clear the error for this field as the user types
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    // Client-side validation
    const validationErrors = validateForm(fields);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      // Move focus to the first invalid field
      const firstErrorId = Object.keys(validationErrors)[0];
      document.getElementById(FIELD_IDS[firstErrorId])?.focus();
      return;
    }

    setSubmitState("submitting");
    setErrors({});

    try {
      /**
       * POST to /api/contact — your SMTP handler.
       * Expected request body: { name, email, subject, message }
       * Expected response: 200 OK on success, any non-2xx on failure.
       *
       * Replace this endpoint with your actual server route or
       * serverless function URL (e.g. /api/send-email, /.netlify/functions/contact).
       */
      const response = await fetch("/api/v1/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });

      if (!response.ok)
        throw new Error(`Server responded with ${response.status}`);

      setSubmitState("success");
      setFields(INITIAL_FORM);
    } catch (err) {
      console.error("[ContactForm] Submission failed:", err);
      setSubmitState("error");
    }
  }

  const isSubmitting = submitState === "submitting";
  const isSuccess = submitState === "success";
  const isError = submitState === "error";

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-8 lg:p-10 shadow-sm">
      {/* Form header */}
      <div className="mb-8">
        <h2 className="font-display font-bold text-gray-900 text-2xl mb-1">
          Send a Message
        </h2>
        <p className="font-body text-gray-400 text-sm">
          Fields marked{" "}
          <span className="text-primary-500" aria-hidden="true">
            *
          </span>{" "}
          are required.
        </p>
      </div>

      {/*
       * Status announcer — role="status" aria-live="polite" ensures screen
       * readers announce the success or error message without disrupting focus.
       */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {isSuccess && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary-50 border border-secondary-200 mb-6">
            <CheckCircle2
              className="w-5 h-5 text-secondary-500 flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <p className="font-body font-semibold text-secondary-800 text-sm">
                Message sent successfully
              </p>
              <p className="font-body text-secondary-600 text-xs mt-0.5">
                Thank you for reaching out. The TAM Secretariat will respond
                within 1 business day.
              </p>
            </div>
          </div>
        )}

        {isError && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-primary-50 border border-primary-200 mb-6">
            <AlertCircle
              className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <p className="font-body font-semibold text-primary-800 text-sm">
                Message could not be sent
              </p>
              <p className="font-body text-primary-600 text-xs mt-0.5">
                Please try again or contact us directly at{" "}
                <a
                  href="mailto:info@transportersmw.com"
                  className="underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500 rounded"
                >
                  info@transportersmw.com
                </a>
                .
              </p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <FormField id={FIELD_IDS.name} label="Full Name" error={errors.name}>
          {({ id, errorId, hasError }) => (
            <input
              id={id}
              name="name"
              type="text"
              autoComplete="name"
              value={fields.name}
              onChange={handleChange}
              placeholder="e.g. Chisomo Banda"
              aria-required="true"
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : undefined}
              disabled={isSubmitting || isSuccess}
              className={cn(
                INPUT_BASE,
                hasError ? "border-primary-300" : "border-gray-200",
                (isSubmitting || isSuccess) && "opacity-60 cursor-not-allowed",
              )}
            />
          )}
        </FormField>

        <FormField
          id={FIELD_IDS.email}
          label="Email Address"
          error={errors.email}
        >
          {({ id, errorId, hasError }) => (
            <input
              id={id}
              name="email"
              type="email"
              autoComplete="email"
              value={fields.email}
              onChange={handleChange}
              placeholder="you@example.com"
              aria-required="true"
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : undefined}
              disabled={isSubmitting || isSuccess}
              className={cn(
                INPUT_BASE,
                hasError ? "border-primary-300" : "border-gray-200",
                (isSubmitting || isSuccess) && "opacity-60 cursor-not-allowed",
              )}
            />
          )}
        </FormField>

        <FormField
          id={FIELD_IDS.subject}
          label="Subject"
          error={errors.subject}
        >
          {({ id, errorId, hasError }) => (
            <select
              id={id}
              name="subject"
              value={fields.subject}
              onChange={handleChange}
              aria-required="true"
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : undefined}
              disabled={isSubmitting || isSuccess}
              className={cn(
                INPUT_BASE,
                "appearance-none cursor-pointer",
                hasError ? "border-primary-300" : "border-gray-200",
                (isSubmitting || isSuccess) && "opacity-60 cursor-not-allowed",
                /* Default option text is placeholder grey */
                !fields.subject && "text-gray-400",
              )}
            >
              {SUBJECT_OPTIONS.map(({ value, label }) => (
                <option
                  key={value}
                  value={value}
                  disabled={value === ""}
                  className="text-gray-900"
                >
                  {label}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField
          id={FIELD_IDS.message}
          label="Message"
          error={errors.message}
        >
          {({ id, errorId, hasError }) => (
            <textarea
              id={id}
              name="message"
              rows={5}
              value={fields.message}
              onChange={handleChange}
              placeholder="Tell us about your enquiry…"
              aria-required="true"
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : undefined}
              disabled={isSubmitting || isSuccess}
              className={cn(
                INPUT_BASE,
                "resize-none",
                hasError ? "border-primary-300" : "border-gray-200",
                (isSubmitting || isSuccess) && "opacity-60 cursor-not-allowed",
              )}
            />
          )}
        </FormField>

        <button
          type="submit"
          disabled={isSubmitting || isSuccess}
          className={cn(
            "inline-flex items-center justify-center gap-2.5",
            "px-6 py-3.5 rounded-xl",
            "font-body font-semibold text-sm text-white",
            "transition-all duration-200 active:scale-[0.97]",
            "focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
            isSuccess
              ? "bg-secondary-500 cursor-default"
              : isSubmitting
                ? "bg-primary-400 cursor-wait"
                : "bg-primary-500 hover:bg-primary-600 shadow-sm hover:shadow-primary-200/60 hover:shadow-md",
            (isSubmitting || isSuccess) && "opacity-80",
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Sending…
            </>
          ) : isSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Message Sent
            </>
          ) : (
            <>
              <Send className="w-4 h-4" aria-hidden="true" />
              Send Message
            </>
          )}
        </button>

        {/* Reset after error — lets user try again cleanly */}
        {isError && (
          <button
            type="button"
            onClick={() => setSubmitState("idle")}
            className={cn(
              "font-body text-sm text-gray-400 hover:text-gray-600",
              "transition-colors duration-200 text-center",
              "focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-gray-400 focus-visible:ring-offset-2 rounded",
            )}
          >
            Try again
          </button>
        )}
      </form>
    </div>
  );
}

/** Two-column contact body — details left, form right */
function ContactBody() {
  return (
    <section className="bg-gray-50 py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[2fr_3fr] gap-10 lg:gap-16 items-start">
          <FadeUp>
            <SectionLabel>Contact Details</SectionLabel>
            <h2
              className="font-display font-bold text-gray-900 leading-tight mb-8"
              style={{ fontSize: "clamp(1.5rem, 2.6vw, 2rem)" }}
            >
              Reach the TAM Secretariat
            </h2>
            <ContactDetailsCard />
          </FadeUp>

          <FadeUp delay={0.1}>
            <ContactForm />
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

// ─── 3. Membership CTA ────────────────────────────────────────────────────────

/**
 * Membership steps — this section is the #membership anchor target.
 * Every "Join TAM" CTA button across the site links to / register page.
 */
const MEMBERSHIP_STEPS = [
  {
    number: "01",
    title: "Create Your Account",
    description:
      "Register on the TAM platform using your email address and secure password.",
  },
  {
    number: "02",
    title: "Complete Your Profile",
    description:
      "Provide your business, fleet, and operator information through the onboarding dashboard.",
  },
  {
    number: "03",
    title: "Upload Required Documents",
    description:
      "Submit your National ID, business registration, TIN certificate, and compliance documents securely online.",
  },
  {
    number: "04",
    title: "Submit for Review",
    description:
      "Send your completed application to the TAM Secretariat for verification and compliance review.",
  },
  {
    number: "05",
    title: "Receive Approval & Access",
    description:
      "Once approved, gain full access to the TAM member portal, notifications, and association services.",
  },
];

function MembershipCTA() {
  return (
    /*
     * id="membership" — this is the anchor target for all "Join TAM" CTAs
     * across Home, About, Services, and the Navbar. Scroll-offset is handled
     * by the browser natively; no JS needed.
     */
    <section
      id="membership"
      className="bg-gray-950 py-24 lg:py-32 relative overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-secondary-600 opacity-10 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp className="max-w-2xl mb-16">
          <SectionLabel light>Membership</SectionLabel>
          <h2
            className="font-display font-bold text-white leading-tight mb-4"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }}
          >
            Ready to Join TAM?
          </h2>
          <p className="font-body text-gray-400 text-base leading-relaxed">
            Becoming a member is a five-step process. The Secretariat guides you
            through each stage — from application to verified status.
          </p>
        </FadeUp>

        {/* Steps grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-12">
          {MEMBERSHIP_STEPS.map((step, i) => (
            <FadeUp key={step.number} delay={i * 0.07}>
              <div className="relative rounded-2xl border border-white/8 bg-white/5 p-6 h-full">
                {/* Connector arrow — desktop only, not on last item */}
                {i < MEMBERSHIP_STEPS.length - 1 && (
                  <ChevronRight
                    className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-700 hidden lg:block z-10"
                    aria-hidden="true"
                  />
                )}
                <span className="font-body text-gray-700 font-bold text-3xl tabular-nums leading-none block mb-4">
                  {step.number}
                </span>
                <h3 className="font-display font-bold text-white text-sm mb-2 leading-snug">
                  {step.title}
                </h3>
                <p className="font-body text-gray-500 text-xs leading-relaxed">
                  {step.description}
                </p>
              </div>
            </FadeUp>
          ))}
        </div>

        {/* Bottom CTAs */}
        <FadeUp delay={0.35}>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Link
              to="/register"
              className={cn(
                "inline-flex items-center gap-2 px-6 py-3 rounded-xl",
                "bg-secondary-500 text-white font-body font-semibold text-sm",
                "hover:bg-secondary-600 transition-all duration-200 active:scale-[0.97]",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-secondary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
              )}
            >
              Start Your Application
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="tel:+265891003936"
              className={cn(
                "inline-flex items-center gap-2 px-6 py-3 rounded-xl",
                "border border-white/20 text-white font-body font-semibold text-sm",
                "hover:bg-white/10 transition-all duration-200 active:scale-[0.97]",
                "focus-visible:outline-none focus-visible:ring-2",
                "focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
              )}
            >
              <Phone className="w-4 h-4" />
              Call the Secretariat
            </a>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

// ─── 4. External Links ────────────────────────────────────────────────────────

/**
 * The 7 government and regulatory partner links.
 * Displayed in classification-index style — consistent with ServicesPage Advocacy section.
 */
const PARTNER_LINKS = [
  {
    abbr: "RTSS",
    name: "Road Traffic & Safety Services",
    role: "Road Safety & Licensing Regulator",
    url: "https://www.rtss.mw",
  },
  {
    abbr: "MACRA",
    name: "Malawi Communications Regulatory Authority",
    role: "Communications & Frequency Regulator",
    url: "https://www.macra.mw",
  },
  {
    abbr: "MERA",
    name: "Malawi Energy Regulatory Authority",
    role: "Petroleum & Energy Regulator",
    url: "https://www.mera.mw",
  },
  {
    abbr: "PIL",
    name: "Petroleum Importers Limited",
    role: "Fuel Importation & Distribution",
    url: "https://www.pil.mw",
  },
  {
    abbr: "MoT",
    name: "Ministry of Transport",
    role: "Transport Policy & Oversight",
    url: "https://www.mot.gov.mw",
  },
  {
    abbr: "DIC",
    name: "Department of Immigration & Citizenship",
    role: "Cross-Border Permits & Visas",
    url: "https://www.immigration.gov.mw",
  },
  {
    abbr: "MPS",
    name: "Malawi Police Service",
    role: "Road Law Enforcement",
    url: "https://www.police.gov.mw",
  },
];

function ExternalLinksSection() {
  return (
    <section className="bg-white py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <FadeUp className="max-w-xl mb-14">
          <SectionLabel>Partner & Government Links</SectionLabel>
          <h2
            className="font-display font-bold text-gray-900 leading-tight mb-3"
            style={{ fontSize: "clamp(1.5rem, 2.6vw, 2rem)" }}
          >
            Regulatory & Partner Bodies
          </h2>
          <p className="font-body text-gray-400 text-sm leading-relaxed">
            TAM works directly with the following government ministries and
            regulatory authorities. All links open in a new tab.
          </p>
        </FadeUp>

        {/* Classification index list */}
        <div className="rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden">
          {/* Table header row */}
          <div className="grid grid-cols-[72px_1fr_auto] sm:grid-cols-[72px_1fr_1fr_auto] gap-4 px-6 py-3 border-b border-gray-100 bg-white">
            <span className="font-body text-gray-400 text-xs uppercase tracking-widest">
              Code
            </span>
            <span className="font-body text-gray-400 text-xs uppercase tracking-widest">
              Organisation
            </span>
            <span className="font-body text-gray-400 text-xs uppercase tracking-widest hidden sm:block">
              Role
            </span>
            <span className="sr-only">Link</span>
          </div>

          {PARTNER_LINKS.map((partner, i) => (
            <FadeUp key={partner.abbr} delay={i * 0.05}>
              <a
                href={partner.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${partner.name} — opens in new tab`}
                className={cn(
                  "grid grid-cols-[72px_1fr_auto] sm:grid-cols-[72px_1fr_1fr_auto] gap-4",
                  "px-6 py-4 border-b border-gray-100 last:border-0",
                  "items-center group",
                  "hover:bg-primary-50 transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
                  "focus-visible:ring-primary-500",
                )}
              >
                {/* Abbr */}
                <span className="font-display font-bold text-gray-800 text-base group-hover:text-primary-600 transition-colors duration-200">
                  {partner.abbr}
                </span>
                {/* Full name */}
                <span className="font-body text-gray-600 text-sm group-hover:text-gray-900 transition-colors duration-200">
                  {partner.name}
                </span>
                {/* Role — hidden on mobile */}
                <span className="font-body text-gray-400 text-xs hidden sm:block">
                  {partner.role}
                </span>
                {/* External icon */}
                <ExternalLink
                  className="w-4 h-4 text-gray-300 group-hover:text-primary-500 transition-colors duration-200 flex-shrink-0"
                  aria-hidden="true"
                />
              </a>
            </FadeUp>
          ))}
        </div>

        {/* Footer note */}
        <FadeUp delay={0.1}>
          <p className="font-body text-gray-400 text-xs mt-4 text-center">
            These links are provided as a convenience. TAM is not responsible
            for the content of external websites.
          </p>
        </FadeUp>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContactPage() {
  return (
    <>
      <PageHero />
      {/*
       * id="contact-form" — smooth-scroll target from the MembershipCTA
       * "Start Your Application" button below.
       */}
      <div id="contact-form">
        <ContactBody />
      </div>
      <MembershipCTA />
      <ExternalLinksSection />
    </>
  );
}
