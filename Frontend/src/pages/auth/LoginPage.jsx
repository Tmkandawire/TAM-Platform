import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../hooks/useAuth.js";
import { cn } from "../../utils/cn.js";

/* ── Validation schema (mirrors backend loginSchema) ────────────────────── */
const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required").max(128),
});

/* ── Animation variants ─────────────────────────────────────────────────── */
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const { loginMutation, isLoggingIn } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data) => {
    loginMutation.mutate(data, {
      onError: (error) => {
        // A pending user who closed the browser mid-onboarding and tries to
        // log back in gets ACCOUNT_INACTIVE from the backend. Route them to
        // /onboarding so they can complete their application rather than
        // showing a confusing "account inactive" error message.
        if (error?.code === "ACCOUNT_INACTIVE") {
          navigate("/onboarding", { replace: true });
          return;
        }

        // All other errors surface as a form-level message under the
        // password field so the user sees it in context.
        setError("password", {
          message: error?.message ?? "Invalid email or password.",
        });
      },
    });
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — branding ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="hidden lg:flex lg:w-1/2 bg-secondary-gradient flex-col items-center justify-center p-16 relative overflow-hidden"
      >
        {/* Background geometric decorations */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />

        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary-500/10 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="absolute top-1/2 right-8 w-px h-64 bg-gradient-to-b from-transparent via-primary-500/30 to-transparent" />

        <div className="relative z-10 max-w-md">
          {/* Logo */}
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

          {/* Headline */}
          <h1 className="font-display text-5xl font-bold text-white leading-tight mb-6">
            Malawi's Leading
            <span className="block text-red-100">Transport Network</span>
          </h1>

          <p className="text-green-50 text-lg leading-relaxed mb-12">
            Empowering the nation through reliable transport solutions since
            2003.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-6">
            {[
              { value: "2003", label: "Established" },
              { value: "500+", label: "Members" },
              { value: "3", label: "Major Clients" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-display text-3xl font-bold text-red-100">
                  {stat.value}
                </div>

                <div className="text-green-100 text-xs mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Right panel — form ─────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-50">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-md"
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
              Welcome back
            </h2>

            <p className="text-gray-500 mt-2">
              Sign in to your TAM member account
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-slate-800">
                    Password
                  </label>

                  <Link
                    to="/forgot-password"
                    className="text-xs text-secondary-600 hover:text-secondary-700 font-medium transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>

                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

                  <input
                    {...register("password")}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
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
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
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
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="btn-primary w-full mt-2"
              >
                {isLoggingIn ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign In
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
            Not a member yet?{" "}
            <Link
              to="/register"
              className="text-primary-700 font-semibold hover:text-secondary-600 transition-colors"
            >
              Apply to join TAM
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
