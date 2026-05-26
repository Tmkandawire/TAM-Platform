/**
 * @file HomePage.jsx
 * @module pages/public
 *
 * TAM Home Page — flagship landing page.
 *
 * Sections (top → bottom):
 *  1. Hero           — full-viewport, red/dark split, Playfair headline + CTAs
 *  2. Stats Bar      — animated counters: Est. 2003, Members, Routes, Partners
 *  3. Partners Strip — NOCMA, PIL, Salima Sugar + past clients marquee
 *  4. Services       — 4 cards: Wet Cargo, Dry Cargo, Advocacy, Consultancy
 *  5. Current Projects — Petroleum Haulage + Local Shunting
 *  6. Vision & Mission — two-column editorial section
 *  7. Membership CTA — 5-step join process
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Fuel,
  Package,
  Megaphone,
  Briefcase,
  MapPin,
  Users,
  Route,
  Building2,
  CheckCircle2,
  ChevronRight,
  Truck,
  Phone,
} from "lucide-react";

// ─── Animation helpers ────────────────────────────────────────────────────────

function FadeUp({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
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

// ─── Animated counter ─────────────────────────────────────────────────────────

function Counter({ to, suffix = "", duration = 2000 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const rafRef = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setCount(to);
      return;
    }

    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic — decelerates as it approaches the target
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * to));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setCount(to);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [inView, to, duration, reduced]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children, light = false }) {
  return (
    <div
      className={`flex items-center gap-2.5 mb-4 ${light ? "text-primary-300" : "text-primary-500"}`}
    >
      <span className="inline-block w-8 h-0.5 bg-current rounded-full" />
      <span className="text-xs font-body font-semibold uppercase tracking-[0.18em]">
        {children}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. HERO
// ═══════════════════════════════════════════════════════════════════════════════

function HeroSection() {
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden bg-gray-950">
      {/* Background geometric split */}
      <div className="absolute inset-0">
        {/* Dark base */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950" />

        {/* Red accent panel — right side diagonal */}
        <div
          className="absolute top-0 right-0 h-full w-[45%] bg-primary-600 opacity-90"
          style={{ clipPath: "polygon(18% 0, 100% 0, 100% 100%, 0% 100%)" }}
        />

        {/* Subtle texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.8) 40px, rgba(255,255,255,0.8) 41px), repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.8) 40px, rgba(255,255,255,0.8) 41px)",
          }}
        />

        {/* Red glow */}
        <div className="absolute top-1/2 right-[30%] -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-primary-500 opacity-10 blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-24">
        <div className="max-w-2xl">
          {/* Pre-headline badge */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary-500/40 bg-primary-500/10 mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
            <span className="text-primary-300 text-xs font-body font-medium tracking-wide">
              Malawi's Transport Authority Since 2003
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.7,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="font-display font-bold text-white leading-[1.08] tracking-tight mb-6"
            style={{ fontSize: "clamp(2.6rem, 5.5vw, 4.2rem)" }}
          >
            Empowering the Nation
            <span className="block text-primary-400"> Through Reliable</span>
            <span className="block">Transport Solutions.</span>
          </motion.h1>

          {/* Sub-copy */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35, ease: "easeOut" }}
            className="text-gray-300 font-body text-lg leading-relaxed mb-10 max-w-xl"
          >
            TAM unites Malawi's transport operators — delivering petroleum, dry
            cargo, and advocacy services that keep the nation moving.
            Member-owned. Government-recognised. Built for the road.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5, ease: "easeOut" }}
            className="flex flex-wrap items-center gap-4"
          >
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg bg-primary-500 text-white font-body font-semibold text-sm hover:bg-primary-600 transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 shadow-lg shadow-primary-900/40"
            >
              Become a Member
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/about"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg border border-secondary-500 text-secondary-400 font-body font-semibold text-sm hover:bg-secondary-500/10 transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
            >
              Learn More
              <ChevronRight className="w-4 h-4" />
            </Link>
          </motion.div>

          {/* Trust signal */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.75 }}
            className="flex items-center gap-3 mt-10 pt-10 border-t border-white/10"
          >
            <div className="flex -space-x-2">
              {[
                "bg-primary-500",
                "bg-secondary-500",
                "bg-amber-500",
                "bg-blue-500",
              ].map((c, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full ${c} border-2 border-gray-950 flex items-center justify-center`}
                >
                  <Truck className="w-3.5 h-3.5 text-white" />
                </div>
              ))}
            </div>
            <p className="text-gray-400 text-sm font-body">
              <span className="text-white font-medium">200+ operators</span>{" "}
              across Malawi trust TAM
            </p>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <span className="text-gray-500 text-xs font-body tracking-widest uppercase">
          Scroll
        </span>
        <div className="w-px h-12 bg-gradient-to-b from-gray-500 to-transparent" />
      </motion.div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. STATS BAR
// ═══════════════════════════════════════════════════════════════════════════════

const STATS = [
  {
    icon: Building2,
    label: "Established",
    value: 2003,
    suffix: "",
    display: "2003",
  },
  {
    icon: Users,
    label: "Members Nationwide",
    value: 200,
    suffix: "+",
    display: null,
  },
  {
    icon: Route,
    label: "Routes Covered",
    value: 12,
    suffix: "+",
    display: null,
  },
  {
    icon: Building2,
    label: "Government Partners",
    value: 7,
    suffix: "",
    display: null,
  },
];

function StatsBar() {
  return (
    <section className="bg-white border-y border-gray-100 py-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">
          {STATS.map(({ icon: Icon, label, value, suffix, display }, i) => (
            <FadeUp key={label} delay={i * 0.08}>
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center group hover:bg-gray-50 transition-colors duration-200">
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center mb-3 group-hover:bg-primary-100 transition-colors duration-200">
                  <Icon className="w-5 h-5 text-primary-500" />
                </div>
                <div className="font-display font-bold text-3xl text-gray-900 leading-none mb-1">
                  {display ?? <Counter to={value} suffix={suffix} />}
                </div>
                <div className="text-gray-500 text-sm font-body">{label}</div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PARTNERS STRIP
// ═══════════════════════════════════════════════════════════════════════════════

const CURRENT_PARTNERS = ["NOCMA", "PIL", "Salima Sugar"];
const PAST_PARTNERS = ["Alliance One Tobacco", "ADMARC", "SFFRFM", "DODMA"];

function PartnersStrip() {
  const allPartners = [
    ...CURRENT_PARTNERS,
    ...PAST_PARTNERS,
    ...CURRENT_PARTNERS,
    ...PAST_PARTNERS,
  ];
  const reduced = useReducedMotion();

  return (
    <section className="bg-gray-950 py-14 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
        <SectionLabel light>Trusted By</SectionLabel>
        <p className="text-gray-400 text-sm font-body">
          Current &amp; past clients and government partners
        </p>
      </div>

      {/* Marquee */}
      <div className="relative">
        <div className="flex gap-0 overflow-hidden">
          <motion.div
            className="flex gap-12 flex-shrink-0 items-center pr-12"
            animate={reduced ? {} : { x: ["0%", "-50%"] }}
            transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
          >
            {allPartners.map((name, i) => (
              <div
                key={i}
                className="flex-shrink-0 px-8 py-4 rounded-lg border border-gray-800 bg-gray-900 hover:border-primary-700 hover:bg-gray-800 transition-all duration-200"
              >
                <span className="text-gray-300 font-body font-semibold text-sm whitespace-nowrap tracking-wide">
                  {name}
                </span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Fade edges */}
        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-gray-950 to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-gray-950 to-transparent pointer-events-none" />
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SERVICES PREVIEW
// ═══════════════════════════════════════════════════════════════════════════════

const SERVICES = [
  {
    icon: Fuel,
    title: "Wet Cargo Haulage",
    description:
      "Petroleum transportation along key Beira and Dar es Salaam corridor routes, serving NOCMA and PIL requirements.",
    color: "primary",
    accent:
      "bg-primary-50 text-primary-500 group-hover:bg-primary-500 group-hover:text-white",
  },
  {
    icon: Package,
    title: "Dry Cargo",
    description:
      "Reliable bulk and general dry cargo transport across Malawi for agricultural, industrial and commercial clients.",
    color: "secondary",
    accent:
      "bg-secondary-50 text-secondary-500 group-hover:bg-secondary-500 group-hover:text-white",
  },
  {
    icon: Megaphone,
    title: "Advocacy",
    description:
      "Representing member interests with government, regulators, and industry bodies to shape fair transport policy.",
    color: "amber",
    accent:
      "bg-amber-50 text-amber-500 group-hover:bg-amber-500 group-hover:text-white",
  },
  {
    icon: Briefcase,
    title: "Consultancy",
    description:
      "Expert transport consultancy, compliance guidance, and training programs for operators and industry stakeholders.",
    color: "blue",
    accent:
      "bg-blue-50 text-blue-500 group-hover:bg-blue-500 group-hover:text-white",
  },
];

function ServicesSection() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <SectionLabel>What We Do</SectionLabel>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-14">
            <h2
              className="font-display font-bold text-gray-900 leading-tight max-w-xl"
              style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)" }}
            >
              Services Built for
              <br />
              Malawi's Roads
            </h2>
            <Link
              to="/services"
              className="inline-flex items-center gap-2 text-primary-500 font-body font-medium text-sm hover:gap-3 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded"
            >
              View all services <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </FadeUp>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {SERVICES.map(({ icon: Icon, title, description, accent }, i) => (
            <FadeUp key={title} delay={i * 0.1}>
              <Link
                to="/services"
                className="group flex flex-col p-7 rounded-2xl border border-gray-100 hover:border-transparent hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300 ${accent}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-display font-semibold text-gray-900 text-lg mb-3 leading-snug">
                  {title}
                </h3>
                <p className="text-gray-500 font-body text-sm leading-relaxed flex-1">
                  {description}
                </p>
                <div className="flex items-center gap-1.5 mt-5 text-xs font-body font-semibold text-gray-400 group-hover:text-primary-500 transition-colors duration-200 uppercase tracking-wide">
                  Learn more <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </Link>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CURRENT PROJECTS
// ═══════════════════════════════════════════════════════════════════════════════

const PROJECTS = [
  {
    tag: "Active Project",
    title: "Petroleum Haulage",
    client: "NOCMA / PIL",
    routes: ["Beira Corridor", "Dar es Salaam Corridor"],
    description:
      "TAM members operate the critical petroleum supply lines that keep Malawi's fuel flowing. From Mozambique and Tanzania's ports to depots across the country, our fleet ensures energy security for the nation.",
    icon: Fuel,
    bg: "bg-primary-600",
    badge: "bg-primary-700 text-primary-100",
  },
  {
    tag: "Active Project",
    title: "Local Shunting Operations",
    client: "Multiple Clients",
    routes: ["Lilongwe", "Blantyre", "Mzuzu"],
    description:
      "Short-haul and local shunting services for industrial, commercial and government clients within Malawi's major urban centres.",
    icon: Truck,
    bg: "bg-secondary-700",
    badge: "bg-secondary-800 text-secondary-100",
  },
];

function ProjectsSection() {
  return (
    <section className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <SectionLabel>On the Ground</SectionLabel>
          <h2
            className="font-display font-bold text-gray-900 leading-tight mb-14"
            style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)" }}
          >
            Current Projects
          </h2>
        </FadeUp>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {PROJECTS.map(
            (
              {
                tag,
                title,
                client,
                routes,
                description,
                icon: Icon,
                bg,
                badge,
              },
              i,
            ) => (
              <FadeUp key={title} delay={i * 0.15}>
                <div
                  className={`${bg} rounded-2xl p-8 text-white overflow-hidden relative`}
                >
                  {/* Background pattern */}
                  <div
                    className="absolute inset-0 opacity-[0.06]"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle, white 1px, transparent 1px)",
                      backgroundSize: "24px 24px",
                    }}
                  />
                  <div className="relative z-10">
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-xs font-body font-semibold ${badge} mb-3`}
                        >
                          {tag}
                        </span>
                        <h3 className="font-display font-bold text-2xl leading-snug">
                          {title}
                        </h3>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                    </div>

                    <p className="text-white/75 font-body text-sm leading-relaxed mb-6">
                      {description}
                    </p>

                    <div className="flex flex-wrap gap-3">
                      <div className="flex items-center gap-1.5 text-white/60 text-xs font-body">
                        <Building2 className="w-3.5 h-3.5" />
                        {client}
                      </div>
                      {routes.map((r) => (
                        <div
                          key={r}
                          className="flex items-center gap-1.5 text-white/60 text-xs font-body"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          {r}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </FadeUp>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. VISION & MISSION
// ═══════════════════════════════════════════════════════════════════════════════

function VisionMissionSection() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <SectionLabel>Who We Are</SectionLabel>
          <h2
            className="font-display font-bold text-gray-900 leading-tight mb-16"
            style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)" }}
          >
            Purpose-Driven Transport
          </h2>
        </FadeUp>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Vision */}
          <FadeUp delay={0.1}>
            <div className="relative p-10 rounded-2xl bg-gray-950 text-white overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-primary-600 opacity-20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-primary-500/20 border border-primary-500/30 flex items-center justify-center">
                    <span className="text-primary-400 font-display font-bold text-lg leading-none"></span>
                  </div>
                  <span className="text-primary-400 font-body font-semibold text-sm uppercase tracking-widest">
                    Vision
                  </span>
                </div>
                <p className="font-display font-semibold text-xl text-white leading-relaxed">
                  To be the leading representative body for road transport
                  operators in Malawi — driving sustainable growth, safety, and
                  professionalism across the sector.
                </p>
              </div>
            </div>
          </FadeUp>

          {/* Mission */}
          <FadeUp delay={0.2}>
            <div className="relative p-10 rounded-2xl bg-secondary-600 text-white overflow-hidden">
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-secondary-400 opacity-20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center">
                    <span className="text-white font-display font-bold text-lg leading-none"></span>
                  </div>
                  <span className="text-white/80 font-body font-semibold text-sm uppercase tracking-widest">
                    Mission
                  </span>
                </div>
                <p className="font-display font-semibold text-xl text-white leading-relaxed">
                  To unite, represent, and empower transport operators through
                  advocacy, training, and access to opportunities — enabling
                  reliable and efficient transport services for Malawi.
                </p>
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. MEMBERSHIP CTA
// ═══════════════════════════════════════════════════════════════════════════════

const MEMBERSHIP_STEPS = [
  {
    step: "01",
    title: "Create Your Account",
    desc: "Register on the TAM platform using your email address and secure password.",
  },
  {
    step: "02",
    title: "Complete Your Profile",
    desc: "Provide your business, fleet, and operator information through the onboarding dashboard.",
  },
  {
    step: "03",
    title: "Upload Required Documents",
    desc: "Submit your National ID, business registration, TIN certificate, and compliance documents securely online.",
  },
  {
    step: "04",
    title: "Submit for Review",
    desc: "Send your completed application to the TAM Secretariat for verification and compliance review.",
  },
  {
    step: "05",
    title: "Receive Approval & Access",
    desc: "Once approved, gain full access to the TAM member portal, notifications, and association services.",
  },
];

function MembershipCTA() {
  return (
    <section className="py-24 bg-gray-950 overflow-hidden relative">
      {/* Background */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary-600 opacity-10 blur-[100px]" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <div className="text-center mb-16">
            <SectionLabel light>Join the Association</SectionLabel>
            <h2
              className="font-display font-bold text-white leading-tight mb-4"
              style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)" }}
            >
              Ready to Join TAM?
            </h2>
            <p className="text-gray-400 font-body text-lg max-w-xl mx-auto">
              Become part of Malawi's leading transport association in five
              straightforward steps.
            </p>
          </div>
        </FadeUp>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-14">
          {MEMBERSHIP_STEPS.map(({ step, title, desc }, i) => (
            <FadeUp key={step} delay={i * 0.08}>
              <div className="relative flex flex-col p-6 rounded-xl border border-gray-800 bg-gray-900/60 hover:border-primary-700 hover:bg-gray-900 transition-all duration-300 h-full">
                {/* Connector line (desktop only) */}
                {i < MEMBERSHIP_STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-9 left-full w-4 h-px bg-gray-700 z-10" />
                )}
                <div className="font-display font-bold text-4xl text-gray-800 leading-none mb-3 select-none">
                  {step}
                </div>
                <h3 className="font-body font-semibold text-white text-sm mb-2">
                  {title}
                </h3>
                <p className="text-gray-500 font-body text-xs leading-relaxed">
                  {desc}
                </p>
                <CheckCircle2 className="w-4 h-4 text-primary-600 mt-4" />
              </div>
            </FadeUp>
          ))}
        </div>

        {/* CTA buttons */}
        <FadeUp>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-primary-500 text-white font-body font-semibold hover:bg-primary-600 transition-all duration-200 active:scale-[0.97] shadow-lg shadow-primary-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
            >
              Start Your Application
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="tel:+265891003936"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-lg border border-gray-700 text-gray-300 font-body font-semibold hover:border-gray-500 hover:text-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
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

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <StatsBar />
      <PartnersStrip />
      <ServicesSection />
      <ProjectsSection />
      <VisionMissionSection />
      <MembershipCTA />
    </>
  );
}
