/**
 * @file AboutPage.jsx
 * @module pages/public
 *
 * TAM About Page
 *
 * Sections (top → bottom):
 *  1. Page Hero        — editorial split: bold stat + intro copy
 *  2. Founding Story   — animated history timeline (27 March 2003 → today)
 *  3. Location card    — Kanengo Industrial Area details
 *  4. Stakeholders     — Board, Secretariat, Members, Clients, Government
 *  5. What Sets TAM Apart — three differentiator cards
 *  6. Vision & Mission — two-column typographic cards
 */

import { useRef, useState } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  AnimatePresence,
} from "framer-motion";
import {
  MapPin,
  Calendar,
  Users,
  Briefcase,
  Building2,
  ShieldCheck,
  Zap,
  Network,
  Eye,
  Target,
  ChevronRight,
  ArrowRight,
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
      initial={{ opacity: 0, y: reduced ? 0 : 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
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
      {/* Background geometry */}
      <div className="absolute inset-0">
        <div
          className="absolute top-0 left-0 w-[55%] h-full bg-primary-600"
          style={{ clipPath: "polygon(0 0, 88% 0, 72% 100%, 0 100%)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full bg-secondary-600 opacity-10 blur-[140px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 lg:py-36">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left — big editorial number */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="text-white"
          >
            <p className="font-body text-sm font-medium text-primary-200 uppercase tracking-[0.2em] mb-6">
              Established
            </p>
            <div
              className="font-display font-bold text-white leading-none mb-4"
              style={{ fontSize: "clamp(5rem, 14vw, 10rem)" }}
            >
              2003
            </div>
            <div className="w-16 h-1 bg-white/30 rounded-full mb-6" />
            <p className="font-body text-primary-100 text-lg leading-relaxed max-w-sm">
              Over two decades as Malawi's backbone of road freight transport.
            </p>
          </motion.div>

          {/* Right — intro copy */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <SectionLabel light>Who We Are</SectionLabel>
            <h1
              className="font-display font-bold text-white leading-tight mb-6"
              style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)" }}
            >
              A Member-Owned Transport Association Built for Malawi's Roads
            </h1>
            <p className="font-body text-gray-300 text-base leading-relaxed mb-4">
              The Transporters Association of Malawi (TAM) is a
              non-governmental, member-based organisation uniting road freight
              operators under a single, government-recognised voice.
            </p>
            <p className="font-body text-gray-400 text-base leading-relaxed mb-8">
              From petroleum haulage on the Beira and Dar es Salaam corridors to
              dry cargo and local shunting, TAM's fleet of 3-tonne to 30-tonne
              trucks — plus tankers — keeps Malawi's economy moving.
            </p>
            <Link
              to="/contact#membership"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-gray-900 font-body font-semibold text-sm hover:bg-gray-100 transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
            >
              Join the Association
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ─── 2. Founding Timeline ─────────────────────────────────────────────────────

const TIMELINE = [
  {
    year: "2003",
    date: "27 March 2003",
    title: "TAM Founded",
    description:
      "The Transporters Association of Malawi is formally established in Lilongwe, uniting independent road freight operators under a shared governance structure.",
    accent: "bg-primary-500",
    textAccent: "text-primary-500",
  },
  {
    year: "2005",
    date: "2005",
    title: "Government Recognition",
    description:
      "TAM receives formal recognition from the Ministry of Transport, establishing it as the official representative body for road freight in Malawi.",
    accent: "bg-secondary-500",
    textAccent: "text-secondary-500",
  },
  {
    year: "2008",
    date: "2008",
    title: "Petroleum Haulage Mandate",
    description:
      "TAM members begin operating Beira and Dar es Salaam petroleum corridor routes in partnership with NOCMA and PIL, securing Malawi's fuel supply chain.",
    accent: "bg-primary-500",
    textAccent: "text-primary-500",
  },
  {
    year: "2015",
    date: "2015",
    title: "Expanded Membership",
    description:
      "Membership grows to over 100 registered operators, with a diversified fleet spanning 3-tonne dry cargo trucks to full tanker units.",
    accent: "bg-secondary-500",
    textAccent: "text-secondary-500",
  },
  {
    year: "2024",
    date: "Present",
    title: "200+ Members & Growing",
    description:
      "TAM now represents over 200 operators nationwide, with active projects across petroleum haulage, local shunting, and advocacy for the transport sector.",
    accent: "bg-primary-500",
    textAccent: "text-primary-500",
  },
];

function TimelineItem({ item, index, isLast }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduced = useReducedMotion();

  return (
    <div ref={ref} className="relative flex gap-6 lg:gap-10">
      {/* Left: year + connector */}
      <div className="flex flex-col items-center flex-shrink-0 w-16 lg:w-24">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={inView ? { scale: 1, opacity: 1 } : {}}
          transition={{
            duration: 0.4,
            delay: reduced ? 0 : index * 0.12,
            ease: "backOut",
          }}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center",
            "border-4 border-white shadow-lg z-10",
            item.accent,
          )}
        >
          <Calendar className="w-5 h-5 text-white" aria-hidden="true" />
        </motion.div>
        {!isLast && (
          <motion.div
            initial={{ scaleY: 0 }}
            animate={inView ? { scaleY: 1 } : {}}
            transition={{
              duration: 0.6,
              delay: reduced ? 0 : index * 0.12 + 0.3,
              ease: "easeOut",
            }}
            className="flex-1 w-0.5 bg-gray-200 origin-top mt-2"
          />
        )}
      </div>

      {/* Right: content */}
      <motion.div
        initial={{ opacity: 0, x: reduced ? 0 : 24 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{
          duration: 0.55,
          delay: reduced ? 0 : index * 0.12 + 0.1,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="pb-12"
      >
        <span
          className={cn(
            "text-xs font-body font-semibold uppercase tracking-widest",
            item.textAccent,
          )}
        >
          {item.date}
        </span>
        <h3 className="font-display font-bold text-gray-900 text-xl mt-1 mb-2">
          {item.title}
        </h3>
        <p className="font-body text-gray-500 text-sm leading-relaxed max-w-xl">
          {item.description}
        </p>
      </motion.div>
    </div>
  );
}

function FoundingTimeline() {
  return (
    <section className="bg-white py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-16 lg:gap-24">
          {/* Left: heading */}
          <FadeUp>
            <SectionLabel>Our History</SectionLabel>
            <h2
              className="font-display font-bold text-gray-900 leading-tight mb-6"
              style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }}
            >
              Two Decades on the Road
            </h2>
            <p className="font-body text-gray-500 text-base leading-relaxed mb-8">
              From a founding meeting in Lilongwe to a nationally recognised
              transport authority — the story of TAM is the story of Malawi's
              freight sector.
            </p>
            {/* Location card */}
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <MapPin
                    className="w-5 h-5 text-primary-500"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="font-body font-semibold text-gray-900 text-sm mb-1">
                    Secretariat Office
                  </p>
                  <p className="font-body text-gray-500 text-sm leading-relaxed">
                    Kanengo Industrial Area
                    <br />
                    TCC Complex, 1st Floor, Room 65
                    <br />
                    Lilongwe, Malawi
                  </p>
                  <p className="font-body text-gray-400 text-xs mt-2">
                    P.O. Box 40644, Kanengo, Lilongwe 4
                  </p>
                </div>
              </div>
            </div>
          </FadeUp>

          {/* Right: timeline */}
          <div className="relative">
            {TIMELINE.map((item, i) => (
              <TimelineItem
                key={item.year}
                item={item}
                index={i}
                isLast={i === TIMELINE.length - 1}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 3. Stakeholders ─────────────────────────────────────────────────────────

const STAKEHOLDERS = [
  {
    icon: ShieldCheck,
    title: "Board Chairperson & Directors",
    description:
      "The elected Board provides strategic governance and fiduciary oversight. Directors represent member interests and set the long-term direction of the association.",
    count: "Elected Board",
    accent: "bg-primary-50 text-primary-600 border-primary-100",
    iconBg: "bg-primary-500",
  },
  {
    icon: Briefcase,
    title: "Secretariat Management & Staff",
    description:
      "The full-time Secretariat team manages day-to-day operations — member services, contract administration, regulatory liaison, and financial management.",
    count: "Operational Core",
    accent: "bg-secondary-50 text-secondary-700 border-secondary-100",
    iconBg: "bg-secondary-500",
  },
  {
    icon: Users,
    title: "Members",
    description:
      "Over 200 registered transport operators form the backbone of TAM. Members access quick mobilisation, streamlined invoicing, insurance coverage, and fleet support.",
    count: "200+ Operators",
    accent: "bg-amber-50 text-amber-700 border-amber-100",
    iconBg: "bg-amber-500",
  },
  {
    icon: Building2,
    title: "Clients",
    description:
      "NOCMA, PIL, Salima Sugar, Alliance One Tobacco, ADMARC, SFFRFM, and DODMA rely on TAM's fleet for dependable, compliant cargo movement across Malawi and the region.",
    count: "Key Clients",
    accent: "bg-blue-50 text-blue-700 border-blue-100",
    iconBg: "bg-blue-500",
  },
  {
    icon: Network,
    title: "Government Partners",
    description:
      "TAM works closely with Road Traffic & Safety Services, MACRA, MERA, the Ministry of Transport, Department of Immigration, and Malawi Police Service.",
    count: "7 Partner Bodies",
    accent: "bg-purple-50 text-purple-700 border-purple-100",
    iconBg: "bg-purple-500",
  },
];

function StakeholdersSection() {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const tabRefs = useRef([]);

  /**
   * WAI-ARIA tab keyboard navigation (WCAG 2.1.1)
   * ArrowDown / ArrowRight → next tab
   * ArrowUp  / ArrowLeft  → previous tab
   * Home                  → first tab
   * End                   → last tab
   * Focus moves with selection — automatic activation pattern.
   */
  function handleTabKeyDown(e, index) {
    const count = STAKEHOLDERS.length;
    let next = null;

    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      next = (index + 1) % count;
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      next = (index - 1 + count) % count;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = count - 1;
    }

    if (next !== null) {
      e.preventDefault();
      setActive(next);
      tabRefs.current[next]?.focus();
    }
  }

  return (
    <section className="bg-gray-950 py-24 lg:py-32 overflow-hidden">
      {/* Background detail */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary-600/5 blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp className="text-center mb-16">
          <SectionLabel light>Governance & Structure</SectionLabel>
          <h2
            className="font-display font-bold text-white leading-tight mb-4"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }}
          >
            Who Makes TAM Work
          </h2>
          <p className="font-body text-gray-400 text-base max-w-xl mx-auto">
            A stakeholder ecosystem built on clear roles, shared accountability,
            and one unified goal — keeping Malawi moving.
          </p>
        </FadeUp>

        {/* Desktop: sidebar + detail */}
        <div className="hidden lg:grid lg:grid-cols-[320px_1fr] gap-8">
          {/* Tab list */}
          <div
            className="flex flex-col gap-2"
            role="tablist"
            aria-label="Stakeholder groups"
          >
            {STAKEHOLDERS.map((s, i) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.title}
                  ref={(el) => (tabRefs.current[i] = el)}
                  role="tab"
                  id={`stakeholder-tab-${i}`}
                  aria-selected={active === i}
                  aria-controls={`stakeholder-panel-${i}`}
                  tabIndex={active === i ? 0 : -1}
                  onClick={() => setActive(i)}
                  onKeyDown={(e) => handleTabKeyDown(e, i)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
                    active === i
                      ? "bg-white/10 text-white"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/5",
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-opacity duration-200",
                      s.iconBg,
                      active === i ? "opacity-100" : "opacity-60",
                    )}
                  >
                    <Icon className="w-4 h-4 text-white" aria-hidden="true" />
                  </div>
                  <span className="font-body font-medium text-sm">
                    {s.title}
                  </span>
                  {active === i && (
                    <ChevronRight
                      className="w-4 h-4 ml-auto text-primary-400"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Panel */}
          <div className="relative">
            <AnimatePresence mode="wait">
              {STAKEHOLDERS.map((s, i) =>
                active === i ? (
                  <motion.div
                    key={s.title}
                    id={`stakeholder-panel-${i}`}
                    role="tabpanel"
                    aria-labelledby={`stakeholder-tab-${i}`}
                    initial={{ opacity: 0, y: reduced ? 0 : 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduced ? 0 : -12 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-10 h-full"
                  >
                    <div
                      className={cn(
                        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-body font-semibold uppercase tracking-widest mb-8",
                        s.accent,
                      )}
                    >
                      {s.count}
                    </div>
                    <div
                      className={cn(
                        "w-16 h-16 rounded-2xl flex items-center justify-center mb-6",
                        s.iconBg,
                      )}
                    >
                      {(() => {
                        const Icon = s.icon;
                        return (
                          <Icon
                            className="w-8 h-8 text-white"
                            aria-hidden="true"
                          />
                        );
                      })()}
                    </div>
                    <h3 className="font-display font-bold text-white text-2xl mb-4">
                      {s.title}
                    </h3>
                    <p className="font-body text-gray-300 text-base leading-relaxed">
                      {s.description}
                    </p>
                  </motion.div>
                ) : null,
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Mobile: stacked cards */}
        <div className="lg:hidden flex flex-col gap-4">
          {STAKEHOLDERS.map((s, i) => {
            const Icon = s.icon;
            return (
              <FadeUp key={s.title} delay={i * 0.07}>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                        s.iconBg,
                      )}
                    >
                      <Icon className="w-5 h-5 text-white" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-body font-semibold text-white text-sm mb-1">
                        {s.title}
                      </p>
                      <p className="font-body text-gray-400 text-sm leading-relaxed">
                        {s.description}
                      </p>
                    </div>
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

// ─── 4. What Sets TAM Apart ───────────────────────────────────────────────────

const DIFFERENTIATORS = [
  {
    icon: Network,
    number: "01",
    title: "Wide Membership Network",
    description:
      "With 200+ operators and a combined fleet spanning 3-tonne trucks to full tanker units, TAM can mobilise rapid, large-scale transport capacity that no single operator can match.",
    highlight: "200+ operators, one unified voice.",
  },
  {
    icon: Zap,
    number: "02",
    title: "Prompt, Reliable Response",
    description:
      "TAM's streamlined dispatch and invoicing systems mean clients receive mobilised transport solutions faster. Operators are pre-vetted, insured, and ready for deployment.",
    highlight: "Fast mobilisation. No delays.",
  },
  {
    icon: ShieldCheck,
    number: "03",
    title: "Efficient, Compliant Transport",
    description:
      "Every TAM operator is registered, insured, and compliant with Road Traffic & Safety Services, MACRA, and MERA regulations — protecting clients from liability and ensuring cargo safety.",
    highlight: "Fully compliant. Fully covered.",
  },
];

function DifferentiatorsSection() {
  return (
    <section className="bg-white py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-16 lg:gap-24 items-start">
          <FadeUp className="lg:sticky lg:top-32">
            <SectionLabel>Why TAM</SectionLabel>
            <h2
              className="font-display font-bold text-gray-900 leading-tight mb-6"
              style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }}
            >
              What Sets TAM Apart
            </h2>
            <p className="font-body text-gray-500 text-base leading-relaxed">
              In a sector defined by reliability and speed, TAM's structure
              gives clients and members advantages that independent operators
              simply cannot offer.
            </p>
          </FadeUp>

          <div className="flex flex-col gap-6">
            {DIFFERENTIATORS.map((d, i) => {
              const Icon = d.icon;
              return (
                <FadeUp key={d.number} delay={i * 0.1}>
                  <div className="group rounded-2xl border border-gray-100 p-8 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-50 transition-all duration-300">
                    <div className="flex items-start gap-6">
                      {/* Number */}
                      <div className="flex-shrink-0">
                        <span className="font-display font-bold text-gray-100 text-5xl leading-none group-hover:text-primary-100 transition-colors duration-300">
                          {d.number}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center group-hover:bg-primary-500 transition-colors duration-300">
                            <Icon
                              className="w-4.5 h-4.5 text-primary-500 group-hover:text-white transition-colors duration-300"
                              aria-hidden="true"
                            />
                          </div>
                          <h3 className="font-display font-bold text-gray-900 text-lg">
                            {d.title}
                          </h3>
                        </div>
                        <p className="font-body text-gray-500 text-sm leading-relaxed mb-4">
                          {d.description}
                        </p>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                          <span className="font-body text-primary-600 text-xs font-semibold">
                            {d.highlight}
                          </span>
                        </div>
                      </div>
                    </div>
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

// ─── 5. Vision & Mission ──────────────────────────────────────────────────────

function VisionMissionSection() {
  return (
    <section className="bg-gray-50 py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp className="text-center mb-16">
          <SectionLabel>Guiding Principles</SectionLabel>
          <h2
            className="font-display font-bold text-gray-900 leading-tight"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)" }}
          >
            Vision & Mission
          </h2>
        </FadeUp>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Vision */}
          <FadeUp delay={0.05}>
            <div className="relative rounded-3xl bg-gray-950 p-10 lg:p-12 overflow-hidden h-full">
              {/* Decorative glow */}
              <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-primary-600 opacity-15 blur-[80px]" />
              <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-primary-800 opacity-10 blur-[60px]" />
              {/* Dot texture */}
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />

              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-primary-500 flex items-center justify-center mb-8">
                  <Eye className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
                <p className="font-body text-primary-400 text-xs font-semibold uppercase tracking-[0.2em] mb-4">
                  Our Vision
                </p>
                <h3 className="font-display font-bold text-white text-2xl lg:text-3xl leading-tight mb-6">
                  To be the leading, most-trusted transport association in
                  Malawi and the region.
                </h3>
                <div className="w-12 h-0.5 bg-primary-500 rounded-full" />
              </div>
            </div>
          </FadeUp>

          {/* Mission */}
          <FadeUp delay={0.12}>
            <div className="relative rounded-3xl bg-secondary-600 p-10 lg:p-12 overflow-hidden h-full">
              {/* Decorative */}
              <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-secondary-400 opacity-20 blur-[80px]" />
              <div
                className="absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />

              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-8">
                  <Target className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
                <p className="font-body text-secondary-100 text-xs font-semibold uppercase tracking-[0.2em] mb-4">
                  Our Mission
                </p>
                <h3 className="font-display font-bold text-white text-2xl lg:text-3xl leading-tight mb-6">
                  To empower Malawian transport operators through advocacy,
                  training, and unified service delivery — keeping the nation's
                  supply chain moving.
                </h3>
                <div className="w-12 h-0.5 bg-white/40 rounded-full" />
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

// ─── 6. CTA Strip ────────────────────────────────────────────────────────────

function CTAStrip() {
  return (
    <section className="bg-primary-500 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeUp>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="font-display font-bold text-white text-2xl mb-1">
                Ready to be part of TAM?
              </h2>
              <p className="font-body text-primary-100 text-sm">
                Join 200+ operators who trust Malawi's leading transport
                association.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                to="/contact#membership"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-primary-600 font-body font-semibold text-sm hover:bg-primary-50 transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-500"
              >
                Become a Member
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/services"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/40 text-white font-body font-semibold text-sm hover:bg-white/10 transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-500"
              >
                Our Services
              </Link>
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <>
      <PageHero />
      <FoundingTimeline />
      <StakeholdersSection />
      <DifferentiatorsSection />
      <VisionMissionSection />
      <CTAStrip />
    </>
  );
}
