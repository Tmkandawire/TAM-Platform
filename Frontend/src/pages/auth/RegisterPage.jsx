import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Mail,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useState, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth.js";
import { cn } from "../../utils/cn.js";

/* ── Validation schema (mirrors backend registerSchema exactly) ─────────── */
const registerSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Please enter a valid email address"),
    password: z
      .string()
      .min(8, "Must be at least 8 characters")
      .max(128, "Password too long")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[a-z]/, "Must contain a lowercase letter")
      .regex(/[0-9]/, "Must contain a number")
      .regex(/[^A-Za-z0-9]/, "Must contain a special character"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/* ── Password strength rules for the visual indicator ──────────────────── */
const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (v) => v.length >= 8 },
  { label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "One lowercase letter", test: (v) => /[a-z]/.test(v) },
  { label: "One number", test: (v) => /[0-9]/.test(v) },
  { label: "One special character", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

function PasswordStrengthIndicator({ password }) {
  const passed = useMemo(
    () => PASSWORD_RULES.filter((r) => r.test(password ?? "")),
    [password],
  );

  const strength = passed.length;

  const strengthConfig = [
    { label: "", color: "bg-gray-200" },
    { label: "Weak", color: "bg-red-400" },
    { label: "Fair", color: "bg-amber-400" },
    { label: "Good", color: "bg-blue-400" },
    { label: "Strong", color: "bg-secondary-400" },
    { label: "Excellent", color: "bg-secondary-500" },
  ];

  if (!password) return null;

  return (
    <div className="mt-3 space-y-2">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i <= strength ? strengthConfig[strength].color : "bg-gray-200",
            )}
          />
        ))}
      </div>

      {strength > 0 && (
        <p className="text-xs text-gray-500">
          Password strength:{" "}
          <span className="font-medium text-slate-800">
            {strengthConfig[strength].label}
          </span>
        </p>
      )}

      {/* Rules checklist */}
      <div className="space-y-1">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password ?? "");

          return (
            <div key={rule.label} className="flex items-center gap-2">
              {ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-secondary-500 shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-gray-300 shrink-0" />
              )}

              <span
                className={cn(
                  "text-xs",
                  ok ? "text-secondary-700" : "text-gray-400",
                )}
              >
                {rule.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Animation variants ─────────────────────────────────────────────────── */
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirm] = useState(false);

  const { registerMutation, isRegistering } = useAuth();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const passwordValue = watch("password");

  const onSubmit = ({ email, password }) =>
    registerMutation.mutate({ email, password });

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — branding ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="hidden lg:flex lg:w-1/2 bg-secondary-gradient flex-col items-center justify-center p-16 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />

        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary-500/10 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10 max-w-md">
          <div className="flex items-center gap-4 mb-16">
            <div className="w-14 h-14 rounded-2xl bg-primary-gradient flex items-center justify-center shadow-secondary-glow">
              <span className="font-display font-bold text-2xl text-white">
                TAM
              </span>
            </div>

            <div>
              <div className="font-display font-bold text-white text-xl leading-none">
                TAM Portal
              </div>

              <div className="text-red-100 text-xs tracking-widest uppercase mt-0.5">
                Transporters Association of Malawi
              </div>
            </div>
          </div>

          <h1 className="font-display text-5xl font-bold text-white leading-tight mb-6">
            Join Malawi's
            <span className="block text-red-100">Transport Network</span>
          </h1>

          <p className="text-green-50 text-lg leading-relaxed mb-12">
            Become a member of TAM and access exclusive haulage contracts,
            government partnerships, and industry support.
          </p>

          {/* Membership benefits */}
          <div className="space-y-4">
            {[
              "Access to haulage contracts (NOCMA, PIL, Salima Sugar)",
              "Insurance coverage for goods in transit",
              "Fleet of 3 to 30 tonne vehicles + tankers",
              "Full government compliance and tax support",
            ].map((benefit) => (
              <div key={benefit} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-red-100 mt-0.5 shrink-0" />

                <span className="text-green-50 text-sm">{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Right panel — form ─────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50 overflow-y-auto">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md py-8"
        >
          {/* Mobile logo */}
          <motion.div
            variants={itemVariants}
            className="flex items-center gap-3 mb-10 lg:hidden"
          >
            <div className="w-10 h-10 rounded-xl bg-primary-gradient flex items-center justify-center">
              <span className="font-display font-bold text-white">T</span>
            </div>

            <span className="font-display font-bold text-slate-900 text-lg">
              TAM Portal
            </span>
          </motion.div>

          {/* Header */}
          <motion.div variants={itemVariants} className="mb-8">
            <h2 className="font-display text-3xl font-bold text-slate-900">
              Create your account
            </h2>

            <p className="text-gray-500 mt-2">
              Apply for TAM membership. Your account will be reviewed before
              activation.
            </p>
          </motion.div>

          {/* Onboarding notice */}
          <motion.div
            variants={itemVariants}
            className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200"
          >
            <p className="text-amber-800 text-sm font-medium">
              📋 After registering, you'll complete your business profile and
              upload your documents. Your application is then reviewed by the
              TAM secretariat before your account is activated.
            </p>
          </motion.div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <motion.div variants={itemVariants} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  Email Address
                </label>

                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

                  <input
                    {...register("email")}
                    type="email"
                    autoComplete="email"
                    placeholder="your@email.com"
                    className={cn(
                      "tam-input pl-10",
                      errors.email &&
                        "border-red-400 focus:ring-red-400 focus:border-red-400",
                    )}
                  />
                </div>

                {errors.email && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  Password
                </label>

                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

                  <input
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Create a strong password"
                    className={cn(
                      "tam-input pl-10 pr-10",
                      errors.password &&
                        "border-red-400 focus:ring-red-400 focus:border-red-400",
                    )}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {errors.password && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {errors.password.message}
                  </p>
                )}

                <PasswordStrengthIndicator password={passwordValue} />
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5">
                  Confirm Password
                </label>

                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

                  <input
                    {...register("confirmPassword")}
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repeat your password"
                    className={cn(
                      "tam-input pl-10 pr-10",
                      errors.confirmPassword &&
                        "border-red-400 focus:ring-red-400 focus:border-red-400",
                    )}
                  />

                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {errors.confirmPassword && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isRegistering}
                className="btn-primary w-full mt-2"
              >
                {isRegistering ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating account…
                  </>
                ) : (
                  <>
                    Create Account & Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.div>
          </form>

          {/* Footer */}
          <motion.p
            variants={itemVariants}
            className="mt-8 text-center text-sm text-gray-500"
          >
            Already a member?{" "}
            <Link
              to="/login"
              className="text-primary-700 font-semibold hover:text-secondary-600 transition-colors"
            >
              Sign in here
            </Link>
          </motion.p>

          <motion.p
            variants={itemVariants}
            className="mt-4 text-center text-xs text-gray-400"
          >
            <Link to="/" className="hover:text-slate-700 transition-colors">
              ← Back to TAM website
            </Link>
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
