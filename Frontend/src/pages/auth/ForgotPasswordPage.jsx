import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, ArrowRight, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "../../utils/cn.js";
import api from "../../services/api.js";

const schema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid email address"),
});

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      await api.post("/auth/forgot-password", data);
    } catch {
      // Always show success — never reveal whether email exists
    } finally {
      setIsLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
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
            Reset Your
            <span className="block text-red-100">Password</span>
          </h1>
          <p className="text-green-50 text-lg leading-relaxed">
            Enter your registered email and we'll send you a secure reset link
            valid for 1 hour.
          </p>
        </div>
      </motion.div>

      {/* Right panel — form */}
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

          {submitted ? (
            /* Success state */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-full bg-secondary-50 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-secondary-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900 mb-3">
                Check your email
              </h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-8">
                If that email address is registered with TAM, you'll receive a
                password reset link shortly. The link expires in 1 hour.
              </p>
              <Link
                to="/login"
                className="btn-primary w-full inline-flex items-center justify-center gap-2"
              >
                Back to Sign In
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          ) : (
            <>
              <motion.div variants={itemVariants} className="mb-8">
                <h2 className="font-display text-3xl font-bold text-slate-900">
                  Forgot password?
                </h2>
                <p className="text-gray-500 mt-2">
                  Enter your email and we'll send you a reset link.
                </p>
              </motion.div>

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <motion.div variants={itemVariants} className="space-y-5">
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

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="btn-primary w-full mt-2"
                  >
                    {isLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        Send Reset Link
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </motion.div>
              </form>

              <motion.p
                variants={itemVariants}
                className="mt-8 text-center text-sm text-gray-500"
              >
                Remember your password?{" "}
                <Link
                  to="/login"
                  className="text-primary-700 font-semibold hover:text-secondary-600 transition-colors"
                >
                  Sign in
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
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
