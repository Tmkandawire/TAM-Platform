import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, ArrowRight, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "../../utils/cn.js";
import api from "../../services/api.js";

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export default function ResetPasswordPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  // No token in URL — show invalid link state
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="text-center max-w-md">
          <h2 className="font-display text-2xl font-bold text-slate-900 mb-3">
            Invalid reset link
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            This password reset link is invalid or has expired. Please request a
            new one.
          </p>
          <Link
            to="/forgot-password"
            className="btn-primary inline-flex items-center gap-2"
          >
            Request New Link <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (data) => {
    console.log("Submitting reset:", {
      token,
      password: data.password,
    });

    setIsLoading(true);
    setServerError(null);
    try {
      await api.post("/auth/reset-password", {
        token,
        password: data.password,
      });
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 3000);
    } catch (err) {
      setServerError(
        err?.message ??
          "This reset link has expired. Please request a new one.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
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
            Create a New
            <span className="block text-red-100">Password</span>
          </h1>
          <p className="text-green-50 text-lg leading-relaxed">
            Choose a strong password with at least 8 characters.
          </p>
        </div>
      </motion.div>

      {/* Right panel */}
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

          {success ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-full bg-secondary-50 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-secondary-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900 mb-3">
                Password reset!
              </h2>
              <p className="text-gray-500 text-sm mb-2">
                Your password has been updated successfully.
              </p>
              <p className="text-gray-400 text-xs mb-8">
                Redirecting you to sign in…
              </p>
              <Link
                to="/login"
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                Sign In Now <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          ) : (
            <>
              <motion.div variants={itemVariants} className="mb-8">
                <h2 className="font-display text-3xl font-bold text-slate-900">
                  Set new password
                </h2>
                <p className="text-gray-500 mt-2">
                  Must be at least 8 characters.
                </p>
              </motion.div>

              {serverError && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200"
                >
                  <p className="text-red-600 text-sm">{serverError}</p>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-red-500 underline mt-1 inline-block"
                  >
                    Request a new reset link
                  </Link>
                </motion.div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <motion.div variants={itemVariants} className="space-y-5">
                  {/* New password */}
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        {...register("password")}
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Min. 8 characters"
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

                  {/* Confirm password */}
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        {...register("confirmPassword")}
                        type={showConfirm ? "text" : "password"}
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
                        aria-label={
                          showConfirm ? "Hide password" : "Show password"
                        }
                      >
                        {showConfirm ? (
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

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn-primary w-full mt-2"
                  >
                    {isLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Resetting…
                      </>
                    ) : (
                      <>
                        Reset Password
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </motion.div>
              </form>

              <motion.p
                variants={itemVariants}
                className="mt-8 text-center text-xs text-gray-400"
              >
                <Link to="/" className="hover:text-slate-700 transition-colors">
                  ← Back to TAM website
                </Link>
              </motion.p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
