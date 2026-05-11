/**
 * @file ServicesPage.jsx
 * @module pages/public
 *
 * TAM Services Page — industrial manifest aesthetic.
 *
 * Sections (top → bottom):
 *  1. Page Hero        — dark, bold section index + headline
 *  2. Haulage Services — Wet Cargo + Dry Cargo, route manifest cards
 *  3. Advocacy         — policy engagement, partner body grid
 *  4. Consultancy      — expert advice offering
 *  5. Training Programs — safety & technique programs
 *  6. Member Benefits  — 5 benefit cards
 *  7. CTA Strip        — contact / join
 */

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  Droplets,
  Package,
  Landmark,
  BookOpen,
  GraduationCap,
  Zap,
  FileText,
  ShieldCheck,
  Truck,
  CheckCircle2,
  ArrowRight,
  MapPin,
  ArrowUpRight,
  Fuel,
  Scale,
  Users,
  BadgeCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
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
  const services = [
    "Wet Cargo Haulage",
    "Dry Cargo Haulage",
    "Advocacy",
    "Consultancy",
    "Training Programs",
  ];

  return (
    <section className="relative bg-gray-950 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        {/* Horizontal rule lines — manifest / ledger feel */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 48px, rgba(255,255,255,0.7) 48px, rgba(255,255,255,0.7) 49px)",
          }}
        />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-primary-600 opacity-10 blur-[140px]" />
        <div className="absolute bottom-0 left-1/4 w-[300px] h-[300px] rounded-full bg-secondary-600 opacity-8 blur-[100px]" />
        {/* Red accent bar — left edge */}
        <div className="absolute top-0 left-0 w-1 h-full bg-primary-500" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 lg:py-36">
        <div className="grid lg:grid-cols-2 gap-16 items-end">
          {/* Left */}
          <div>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary-500/40 bg-primary-500/10 mb-8"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse" />
              <span className="text-primary-300 text-xs font-body font-medium tracking-wide">
                What We Offer
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
              Freight, Advocacy,
              <span className="block text-primary-400"> and Expertise.</span>
              <span className="block">All Under One Roof.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="font-body text-gray-300 text-base leading-relaxed max-w-lg"
            >
              TAM delivers end-to-end transport solutions — from petroleum
              haulage on international corridors to sector advocacy, expert
              consultancy, and operator training.
            </motion.p>
          </div>

          {/* Right — service index manifest */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.35 }}
            className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden"
          >
            {/* Manifest header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-white/5">
              <span className="font-body text-gray-500 text-xs uppercase tracking-widest">
                Service Index
              </span>
              <span className="font-body text-gray-500 text-xs uppercase tracking-widest">
                TAM / 2024
              </span>
            </div>
            {services.map((name, i) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.5 + i * 0.07 }}
                className="flex items-center gap-4 px-6 py-4 border-b border-white/5 last:border-0 group hover:bg-white/5 transition-colors duration-200"
              >
                <span className="font-body text-gray-600 text-xs w-6 flex-shrink-0 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-body font-medium text-gray-200 text-sm flex-1">
                  {name}
                </span>
                <ArrowUpRight
                  className="w-3.5 h-3.5 text-gray-600 group-hover:text-primary-400 transition-colors duration-200"
                  aria-hidden="true"
                />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── 2. Haulage Services ──────────────────────────────────────────────────────

const ROUTES = [
  {
    id: "BEI",
    origin: "Lilongwe",
    destination: "Beira",
    country: "Mozambique",
    corridor: "Beira Corridor",
    cargo: "Petroleum / Fuel Products",
    clients: ["NOCMA", "PIL"],
    distance: "≈ 760 km",
    type: "wet",
  },
  {
    id: "DAR",
    origin: "Lilongwe",
    destination: "Dar es Salaam",
    country: "Tanzania",
    corridor: "Northern Corridor",
    cargo: "Petroleum / Fuel Products",
    clients: ["NOCMA", "PIL"],
    distance: "≈ 1,400 km",
    type: "wet",
  },
  {
    id: "LCL",
    origin: "Lilongwe",
    destination: "Local Routes",
    country: "Malawi",
    corridor: "Domestic Network",
    cargo: "Dry Cargo — All Categories",
    clients: ["Various"],
    distance: "Nationwide",
    type: "dry",
  },
  {
    id: "INT",
    origin: "Lilongwe",
    destination: "Regional Markets",
    country: "SADC Region",
    corridor: "Cross-Border",
    cargo: "Dry Cargo — All Categories",
    clients: ["Various"],
    distance: "Regional",
    type: "dry",
  },
];

function RouteCard({ route, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduced = useReducedMotion();
  const isWet = route.type === "wet";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: reduced ? 0 : 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.55,
        delay: index * 0.08,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(
        "group relative rounded-2xl border overflow-hidden",
        isWet
          ? "border-primary-100 bg-white hover:border-primary-300 hover:shadow-xl hover:shadow-primary-50"
          : "border-secondary-100 bg-white hover:border-secondary-300 hover:shadow-xl hover:shadow-secondary-50",
        "transition-all duration-300",
      )}
    >
      {/* Top accent bar */}
      <div
        className={cn(
          "h-1 w-full",
          isWet ? "bg-primary-500" : "bg-secondary-500",
        )}
      />

      <div className="p-6">
        {/* Header row */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                isWet ? "bg-primary-50" : "bg-secondary-50",
              )}
            >
              {isWet ? (
                <Fuel className="w-5 h-5 text-primary-500" aria-hidden="true" />
              ) : (
                <Package
                  className="w-5 h-5 text-secondary-600"
                  aria-hidden="true"
                />
              )}
            </div>
            <div>
              <span
                className={cn(
                  "text-xs font-body font-semibold uppercase tracking-widest",
                  isWet ? "text-primary-500" : "text-secondary-600",
                )}
              >
                {route.corridor}
              </span>
              <p className="font-body text-gray-400 text-xs">{route.cargo}</p>
            </div>
          </div>
          {/* Route code badge */}
          <span className="font-body font-bold text-gray-200 text-lg tabular-nums tracking-wider">
            {route.id}
          </span>
        </div>

        {/* Route path */}
        <div className="flex items-center gap-2 mb-5">
          <div className="text-center">
            <p className="font-display font-bold text-gray-900 text-sm">
              {route.origin}
            </p>
            <p className="font-body text-gray-400 text-xs">Malawi</p>
          </div>
          <div className="flex-1 flex items-center gap-1">
            <div className="flex-1 h-px bg-gray-200" />
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                isWet ? "bg-primary-500" : "bg-secondary-500",
              )}
            >
              <Truck className="w-3 h-3 text-white" aria-hidden="true" />
            </div>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="text-center">
            <p className="font-display font-bold text-gray-900 text-sm">
              {route.destination}
            </p>
            <p className="font-body text-gray-400 text-xs">{route.country}</p>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
            <span className="font-body text-gray-500 text-xs">
              {route.distance}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {route.clients.map((c) => (
              <span
                key={c}
                className={cn(
                  "px-2 py-0.5 rounded-md text-xs font-body font-medium",
                  isWet
                    ? "bg-primary-50 text-primary-600"
                    : "bg-secondary-50 text-secondary-700",
                )}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function HaulageSection() {
  return (
    <section className="bg-gray-50 py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="grid lg:grid-cols-[1fr_2fr] gap-12 lg:gap-20 mb-16">
          <FadeUp>
            <div className="flex items-center gap-3 mb-6">
              <span className="font-body text-gray-200 font-bold text-5xl leading-none tabular-nums">
                01
              </span>
              <div className="w-px h-12 bg-gray-200" />
              <SectionLabel>Haulage Services</SectionLabel>
            </div>
            <h2
              className="font-display font-bold text-gray-900 leading-tight"
              style={{ fontSize: "clamp(1.6rem, 2.8vw, 2.25rem)" }}
            >
              Moving Malawi's Most Critical Cargo
            </h2>
          </FadeUp>

          <FadeUp delay={0.1}>
            <div className="grid sm:grid-cols-2 gap-4 h-full items-start">
              {/* Wet cargo pill */}
              <div className="rounded-2xl border border-primary-100 bg-white p-5">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
                    <Droplets
                      className="w-4 h-4 text-white"
                      aria-hidden="true"
                    />
                  </div>
                  <span className="font-body font-semibold text-gray-900 text-sm">
                    Wet Cargo
                  </span>
                </div>
                <p className="font-body text-gray-500 text-sm leading-relaxed">
                  Petroleum and fuel products transported via specialised tanker
                  fleet on international corridors — Beira (Mozambique) and Dar
                  es Salaam (Tanzania).
                </p>
              </div>
              {/* Dry cargo pill */}
              <div className="rounded-2xl border border-secondary-100 bg-white p-5">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary-500 flex items-center justify-center">
                    <Package
                      className="w-4 h-4 text-white"
                      aria-hidden="true"
                    />
                  </div>
                  <span className="font-body font-semibold text-gray-900 text-sm">
                    Dry Cargo
                  </span>
                </div>
                <p className="font-body text-gray-500 text-sm leading-relaxed">
                  General and specialised dry cargo across local Malawian routes
                  and regional SADC markets — 3-tonne to 30-tonne capacity
                  available.
                </p>
              </div>
            </div>
          </FadeUp>
        </div>

        {/* Route manifest grid */}
        <div>
          <FadeUp>
            <div className="flex items-center gap-3 mb-6">
              <span className="font-body text-gray-400 text-xs uppercase tracking-widest">
                Active Routes
              </span>
              <div className="flex-1 h-px bg-gray-200" />
              <span className="font-body text-gray-400 text-xs tabular-nums">
                {ROUTES.length} corridors
              </span>
            </div>
          </FadeUp>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ROUTES.map((route, i) => (
              <RouteCard key={route.id} route={route} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 3. Advocacy ─────────────────────────────────────────────────────────────

const ADVOCACY_PARTNERS = [
  { name: "Road Traffic & Safety Services", abbr: "RTSS" },
  { name: "Malawi Communications Reg. Authority", abbr: "MACRA" },
  { name: "Malawi Energy Regulatory Authority", abbr: "MERA" },
  { name: "Ministry of Transport", abbr: "MoT" },
  { name: "Dept. of Immigration & Citizenship", abbr: "DIC" },
  { name: "Malawi Police Service", abbr: "MPS" },
];

function AdvocacySection() {
  return (
    <section className="bg-gray-950 py-24 lg:py-32 overflow-hidden relative">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-secondary-600 opacity-8 blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-primary-600 opacity-8 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[2fr_1fr] gap-16 lg:gap-24 items-start">
          {/* Left */}
          <div>
            <FadeUp>
              <div className="flex items-center gap-3 mb-8">
                <span className="font-body text-gray-700 font-bold text-5xl leading-none tabular-nums">
                  02
                </span>
                <div className="w-px h-12 bg-gray-800" />
                <SectionLabel light>Advocacy</SectionLabel>
              </div>
              <h2
                className="font-display font-bold text-white leading-tight mb-6"
                style={{ fontSize: "clamp(1.6rem, 2.8vw, 2.25rem)" }}
              >
                Giving Malawi's Transport Sector a Unified Voice
              </h2>
              <p className="font-body text-gray-400 text-base leading-relaxed mb-6 max-w-xl">
                TAM engages directly with government ministries, regulatory
                authorities, and policy bodies on behalf of its members —
                shaping legislation, tariffs, and operational frameworks that
                affect the entire road freight sector.
              </p>
              <p className="font-body text-gray-500 text-base leading-relaxed max-w-xl">
                Through structured dialogue and formal representation, TAM
                ensures that operators' concerns are heard at the highest levels
                — from fuel levy discussions to road safety regulation and
                cross-border transit policies.
              </p>
            </FadeUp>

            {/* Partner grid */}
            <div className="mt-12">
              <FadeUp delay={0.1}>
                <p className="font-body text-gray-600 text-xs uppercase tracking-widest mb-5">
                  Engagement Partners
                </p>
              </FadeUp>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ADVOCACY_PARTNERS.map((p, i) => (
                  <FadeUp key={p.abbr} delay={0.12 + i * 0.06}>
                    <div className="group rounded-xl border border-white/8 bg-white/5 p-4 hover:bg-white/10 hover:border-white/15 transition-all duration-200">
                      <p className="font-display font-bold text-white text-lg mb-1">
                        {p.abbr}
                      </p>
                      <p className="font-body text-gray-500 text-xs leading-tight">
                        {p.name}
                      </p>
                    </div>
                  </FadeUp>
                ))}
              </div>
            </div>
          </div>

          {/* Right — stat card */}
          <FadeUp delay={0.15}>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 lg:sticky lg:top-32">
              <div className="w-12 h-12 rounded-2xl bg-secondary-500 flex items-center justify-center mb-6">
                <Landmark className="w-6 h-6 text-white" aria-hidden="true" />
              </div>
              <p className="font-body text-secondary-400 text-xs font-semibold uppercase tracking-widest mb-3">
                Policy Impact
              </p>
              <h3 className="font-display font-bold text-white text-2xl mb-4 leading-tight">
                Direct representation across 6 government and regulatory bodies
              </h3>
              <div className="space-y-3 mt-6 pt-6 border-t border-white/10">
                {[
                  "Fuel levy negotiation",
                  "Road safety frameworks",
                  "Cross-border transit policy",
                  "Operator licensing reform",
                ].map((point) => (
                  <div key={point} className="flex items-start gap-2.5">
                    <CheckCircle2
                      className="w-4 h-4 text-secondary-400 flex-shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span className="font-body text-gray-400 text-sm">
                      {point}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

// ─── 4. Consultancy ───────────────────────────────────────────────────────────

const CONSULTANCY_AREAS = [
  {
    icon: Scale,
    title: "Regulatory Compliance",
    description:
      "Navigate Malawi's transport regulatory landscape — licensing, permits, axle-load compliance, and SADC cross-border documentation.",
  },
  {
    icon: Truck,
    title: "Fleet Operations",
    description:
      "Optimise fleet deployment, maintenance scheduling, route efficiency, and cargo capacity planning for maximum operational yield.",
  },
  {
    icon: FileText,
    title: "Contract & Procurement",
    description:
      "Expert guidance on freight contract structuring, client tender preparation, and multi-operator haulage agreements.",
  },
  {
    icon: Users,
    title: "Operator Development",
    description:
      "Support for new and growing transport businesses — from business registration and RTSS certification to fleet financing advice.",
  },
];

function ConsultancySection() {
  return (
    <section className="bg-white py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="grid lg:grid-cols-[1fr_2fr] gap-12 lg:gap-20 mb-16">
          <FadeUp className="lg:sticky lg:top-32 self-start">
            <div className="flex items-center gap-3 mb-6">
              <span className="font-body text-gray-100 font-bold text-5xl leading-none tabular-nums">
                03
              </span>
              <div className="w-px h-12 bg-gray-200" />
              <SectionLabel>Consultancy</SectionLabel>
            </div>
            <h2
              className="font-display font-bold text-gray-900 leading-tight mb-5"
              style={{ fontSize: "clamp(1.6rem, 2.8vw, 2.25rem)" }}
            >
              Expert Transport & Logistics Advice
            </h2>
            <p className="font-body text-gray-500 text-sm leading-relaxed">
              TAM's secretariat and senior members bring decades of operational
              experience to consultancy engagements — from SME operators seeking
              compliance guidance to corporate clients planning large-scale
              logistics operations.
            </p>
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 mt-8 px-5 py-2.5 rounded-lg bg-primary-500 text-white font-body font-semibold text-sm hover:bg-primary-600 transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
            >
              Request a Consultation
              <ArrowRight className="w-4 h-4" />
            </Link>
          </FadeUp>

          {/* Expertise grid */}
          <div className="grid sm:grid-cols-2 gap-4">
            {CONSULTANCY_AREAS.map((area, i) => {
              const Icon = area.icon;
              return (
                <FadeUp key={area.title} delay={i * 0.08}>
                  <div className="group rounded-2xl border border-gray-100 p-7 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-50/50 transition-all duration-300 h-full">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center mb-5 group-hover:bg-primary-500 transition-colors duration-300">
                      <Icon
                        className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors duration-300"
                        aria-hidden="true"
                      />
                    </div>
                    <h3 className="font-display font-bold text-gray-900 text-base mb-2">
                      {area.title}
                    </h3>
                    <p className="font-body text-gray-500 text-sm leading-relaxed">
                      {area.description}
                    </p>
                  </div>
                </FadeUp>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 5. Training Programs ─────────────────────────────────────────────────────

const TRAINING_MODULES = [
  {
    code: "T-01",
    title: "Road Safety & Defensive Driving",
    duration: "2 Days",
    level: "All Operators",
    color: "bg-primary-500",
  },
  {
    code: "T-02",
    title: "Hazardous Materials Handling",
    duration: "3 Days",
    level: "Wet Cargo Operators",
    color: "bg-amber-500",
  },
  {
    code: "T-03",
    title: "Cross-Border Documentation",
    duration: "1 Day",
    level: "International Routes",
    color: "bg-secondary-500",
  },
  {
    code: "T-04",
    title: "Fleet Maintenance & Inspection",
    duration: "2 Days",
    level: "All Operators",
    color: "bg-blue-500",
  },
  {
    code: "T-05",
    title: "Regulatory Compliance Update",
    duration: "Half Day",
    level: "Management",
    color: "bg-purple-500",
  },
];

function TrainingSection() {
  return (
    <section className="bg-gray-50 py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[2fr_3fr] gap-16 lg:gap-20 items-start">
          {/* Left */}
          <FadeUp>
            <div className="flex items-center gap-3 mb-6">
              <span className="font-body text-gray-200 font-bold text-5xl leading-none tabular-nums">
                04
              </span>
              <div className="w-px h-12 bg-gray-200" />
              <SectionLabel>Training Programs</SectionLabel>
            </div>
            <h2
              className="font-display font-bold text-gray-900 leading-tight mb-5"
              style={{ fontSize: "clamp(1.6rem, 2.8vw, 2.25rem)" }}
            >
              Building Safer, More Capable Operators
            </h2>
            <p className="font-body text-gray-500 text-base leading-relaxed mb-4">
              TAM delivers structured training programs covering the latest
              safety protocols, regulatory requirements, and operational
              techniques — keeping members at the frontier of professional road
              freight practice.
            </p>
            <p className="font-body text-gray-500 text-base leading-relaxed mb-8">
              Programs are delivered by industry practitioners and accredited
              facilitators, with content updated to reflect current Malawian and
              SADC-region regulatory standards.
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary-50 flex items-center justify-center">
                <GraduationCap
                  className="w-5 h-5 text-secondary-600"
                  aria-hidden="true"
                />
              </div>
              <div>
                <p className="font-body font-semibold text-gray-900 text-sm">
                  Practitioner-Led
                </p>
                <p className="font-body text-gray-400 text-xs">
                  Industry experts & accredited facilitators
                </p>
              </div>
            </div>
          </FadeUp>

          {/* Right — training module manifest */}
          <FadeUp delay={0.1}>
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              {/*
               * Semantic <table> with proper <thead>/<tbody>, <th scope="col">,
               * and a visually-hidden <caption> so screen readers announce the
               * table's purpose before reading column headers.
               * Visual output is identical to the previous div/grid layout.
               */}
              <table className="w-full border-collapse">
                <caption className="sr-only">
                  TAM training program modules — code, title, duration, and
                  target audience
                </caption>
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th
                      scope="col"
                      className="font-body text-gray-400 text-xs uppercase tracking-widest text-left px-5 py-3 w-14"
                    >
                      Code
                    </th>
                    <th
                      scope="col"
                      className="font-body text-gray-400 text-xs uppercase tracking-widest text-left px-4 py-3"
                    >
                      Module
                    </th>
                    <th
                      scope="col"
                      className="font-body text-gray-400 text-xs uppercase tracking-widest text-left px-4 py-3 w-20 hidden sm:table-cell"
                    >
                      Duration
                    </th>
                    <th
                      scope="col"
                      className="font-body text-gray-400 text-xs uppercase tracking-widest text-left px-4 py-3 w-32 hidden sm:table-cell"
                    >
                      Audience
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TRAINING_MODULES.map((mod, i) => (
                    <motion.tr
                      key={mod.code}
                      initial={{ opacity: 0, x: 16 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{ duration: 0.4, delay: i * 0.07 }}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70 transition-colors duration-150"
                    >
                      {/* Code cell */}
                      <td className="px-5 py-4 align-middle">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "w-1.5 h-6 rounded-full flex-shrink-0",
                              mod.color,
                            )}
                            aria-hidden="true"
                          />
                          <span className="font-body text-gray-400 text-xs tabular-nums">
                            {mod.code}
                          </span>
                        </div>
                      </td>
                      {/* Module title cell */}
                      <td className="px-4 py-4 align-middle">
                        <span className="font-body font-medium text-gray-800 text-sm">
                          {mod.title}
                        </span>
                      </td>
                      {/* Duration cell — hidden on mobile */}
                      <td className="px-4 py-4 align-middle hidden sm:table-cell">
                        <span className="font-body text-gray-400 text-xs">
                          {mod.duration}
                        </span>
                      </td>
                      {/* Audience badge cell — hidden on mobile */}
                      <td className="px-4 py-4 align-middle hidden sm:table-cell">
                        <span
                          className={cn(
                            "inline-flex px-2 py-1 rounded-md text-xs font-body font-medium",
                            mod.color === "bg-primary-500"
                              ? "bg-primary-50 text-primary-600"
                              : mod.color === "bg-secondary-500"
                                ? "bg-secondary-50 text-secondary-700"
                                : mod.color === "bg-amber-500"
                                  ? "bg-amber-50 text-amber-700"
                                  : mod.color === "bg-blue-500"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-purple-50 text-purple-700",
                          )}
                        >
                          {mod.level}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>

              {/* Footer note */}
              <div className="px-5 py-4 bg-secondary-50 border-t border-secondary-100 flex items-start gap-2.5">
                <BookOpen
                  className="w-4 h-4 text-secondary-500 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="font-body text-secondary-700 text-xs leading-relaxed">
                  Training schedules are issued quarterly. Contact the
                  Secretariat to register or request a custom program for your
                  organisation.
                </p>
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

// ─── 6. Member Benefits ───────────────────────────────────────────────────────

const BENEFITS = [
  {
    icon: Zap,
    number: "01",
    title: "Quick Mobilisation",
    description:
      "TAM's pooled fleet and coordinated dispatch means operators can be deployed rapidly for large or urgent cargo assignments that single operators couldn't fulfil alone.",
    metric: "Rapid deployment",
    metricLabel: "across the network",
    accent: "primary",
  },
  {
    icon: FileText,
    number: "02",
    title: "Streamlined Invoicing",
    description:
      "Centralised invoicing through the Secretariat reduces administrative overhead for both members and clients — one point of contact, one invoice, full accountability.",
    metric: "Single invoice",
    metricLabel: "per engagement",
    accent: "secondary",
  },
  {
    icon: ShieldCheck,
    number: "03",
    title: "Insurance Coverage",
    description:
      "TAM facilitates group insurance arrangements for registered members, covering cargo liability and operator risk at rates unavailable to individual operators.",
    metric: "Group rates",
    metricLabel: "unavailable independently",
    accent: "primary",
  },
  {
    icon: Truck,
    number: "04",
    title: "Fleet Access",
    description:
      "Access to the full TAM fleet — 3-tonne to 30-tonne trucks and specialist tanker units — enabling members to take on cargo assignments beyond their own capacity.",
    metric: "3–30 tonne",
    metricLabel: "plus tanker fleet",
    accent: "secondary",
  },
  {
    icon: BadgeCheck,
    number: "05",
    title: "Full Compliance Support",
    description:
      "TAM maintains up-to-date compliance status for all members — RTSS registration, operator licences, MERA permits, and cross-border documentation — backed by Secretariat support.",
    metric: "Always compliant",
    metricLabel: "across all regulations",
    accent: "primary",
  },
];

function MemberBenefitsSection() {
  return (
    <section className="bg-gray-950 py-24 lg:py-32 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent, transparent 60px, rgba(255,255,255,0.6) 60px, rgba(255,255,255,0.6) 61px), repeating-linear-gradient(0deg, transparent, transparent 60px, rgba(255,255,255,0.6) 60px, rgba(255,255,255,0.6) 61px)",
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary-600 opacity-10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <FadeUp className="max-w-2xl mb-16">
          <SectionLabel light>Member Benefits</SectionLabel>
          <h2
            className="font-display font-bold text-white leading-tight mb-4"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }}
          >
            What Membership Unlocks
          </h2>
          <p className="font-body text-gray-400 text-base leading-relaxed">
            TAM membership is an operational advantage — not just an
            affiliation. Every registered member gains access to infrastructure,
            coverage, and capabilities that transform what their business can
            deliver.
          </p>
        </FadeUp>

        {/* Benefits — 3 + 2 asymmetric grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
          {BENEFITS.slice(0, 3).map((b, i) => {
            const Icon = b.icon;
            const isPrimary = b.accent === "primary";
            return (
              <FadeUp key={b.number} delay={i * 0.08}>
                <div
                  className={cn(
                    "group rounded-2xl border p-7 h-full transition-all duration-300",
                    isPrimary
                      ? "border-white/8 bg-white/5 hover:bg-white/8 hover:border-primary-500/30"
                      : "border-white/8 bg-white/5 hover:bg-white/8 hover:border-secondary-500/30",
                  )}
                >
                  <div className="flex items-start justify-between mb-6">
                    <div
                      className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center",
                        isPrimary ? "bg-primary-500" : "bg-secondary-500",
                      )}
                    >
                      <Icon className="w-5 h-5 text-white" aria-hidden="true" />
                    </div>
                    <span className="font-body text-gray-700 font-bold text-3xl tabular-nums leading-none">
                      {b.number}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-white text-lg mb-3">
                    {b.title}
                  </h3>
                  <p className="font-body text-gray-400 text-sm leading-relaxed mb-6">
                    {b.description}
                  </p>
                  <div
                    className={cn(
                      "inline-flex flex-col pt-4 border-t w-full",
                      isPrimary
                        ? "border-primary-500/20"
                        : "border-secondary-500/20",
                    )}
                  >
                    <span
                      className={cn(
                        "font-display font-bold text-sm",
                        isPrimary ? "text-primary-400" : "text-secondary-400",
                      )}
                    >
                      {b.metric}
                    </span>
                    <span className="font-body text-gray-600 text-xs">
                      {b.metricLabel}
                    </span>
                  </div>
                </div>
              </FadeUp>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {BENEFITS.slice(3).map((b, i) => {
            const Icon = b.icon;
            const isPrimary = b.accent === "primary";
            return (
              <FadeUp key={b.number} delay={0.24 + i * 0.08}>
                <div
                  className={cn(
                    "group rounded-2xl border p-7 h-full transition-all duration-300",
                    isPrimary
                      ? "border-white/8 bg-white/5 hover:bg-white/8 hover:border-primary-500/30"
                      : "border-white/8 bg-white/5 hover:bg-white/8 hover:border-secondary-500/30",
                  )}
                >
                  <div className="flex items-start justify-between mb-6">
                    <div
                      className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center",
                        isPrimary ? "bg-primary-500" : "bg-secondary-500",
                      )}
                    >
                      <Icon className="w-5 h-5 text-white" aria-hidden="true" />
                    </div>
                    <span className="font-body text-gray-700 font-bold text-3xl tabular-nums leading-none">
                      {b.number}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-white text-lg mb-3">
                    {b.title}
                  </h3>
                  <p className="font-body text-gray-400 text-sm leading-relaxed mb-6">
                    {b.description}
                  </p>
                  <div
                    className={cn(
                      "inline-flex flex-col pt-4 border-t w-full",
                      isPrimary
                        ? "border-primary-500/20"
                        : "border-secondary-500/20",
                    )}
                  >
                    <span
                      className={cn(
                        "font-display font-bold text-sm",
                        isPrimary ? "text-primary-400" : "text-secondary-400",
                      )}
                    >
                      {b.metric}
                    </span>
                    <span className="font-body text-gray-600 text-xs">
                      {b.metricLabel}
                    </span>
                  </div>
                </div>
              </FadeUp>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── 7. CTA Strip ────────────────────────────────────────────────────────────

function CTAStrip() {
  return (
    <section className="bg-primary-500 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="font-display font-bold text-white text-2xl mb-1">
                Ready to access these services?
              </h2>
              <p className="font-body text-primary-100 text-sm">
                Speak to the TAM Secretariat or apply for membership today.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-primary-600 font-body font-semibold text-sm hover:bg-primary-50 transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-500"
              >
                Contact Us
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/contact#membership"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/40 text-white font-body font-semibold text-sm hover:bg-white/10 transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-500"
              >
                Join TAM
              </Link>
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ServicesPage() {
  return (
    <>
      <PageHero />
      <HaulageSection />
      <AdvocacySection />
      <ConsultancySection />
      <TrainingSection />
      <MemberBenefitsSection />
      <CTAStrip />
    </>
  );
}
