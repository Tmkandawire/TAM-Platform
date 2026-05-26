/**
 * @file PublicLayout.jsx
 * @module components/layout
 *
 * Public page layout wrapper.
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 * - Wraps every public-facing page (Home, About, Services, Contact)
 * - Renders Navbar at top, Footer at bottom
 * - Provides page transition animation via Framer Motion
 * - AnimatePresence key = pathname so each route triggers a fresh animation
 * - Respects prefers-reduced-motion — swaps to instant variants at OS level
 *
 * Usage:
 *   Wrap in the router as the parent of all public <Route> elements:
 *
 *   <Route element={<PublicLayout />}>
 *     <Route path="/"         element={<HomePage />} />
 *     <Route path="/about"    element={<AboutPage />} />
 *     <Route path="/services" element={<ServicesPage />} />
 *     <Route path="/contact"  element={<ContactPage />} />
 *   </Route>
 */
import { Outlet, useLocation, ScrollRestoration } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import Navbar from "./navbar/Navbar";
import Footer from "./Footer";

// ─── Page transition variants ─────────────────────────────────────────────────

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

/**
 * Instant variants — no position shift, no duration.
 * Swapped in when the user has prefers-reduced-motion enabled at OS level.
 * Preserves the mount/unmount lifecycle without any motion.
 */
const reducedPageVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0 },
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PublicLayout() {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();

  const variants = prefersReducedMotion ? reducedPageVariants : pageVariants;

  return (
    <div className="min-h-screen flex flex-col bg-white font-body w-full overflow-x-hidden">
      {/* Resets scroll to top on every route change — no visual output */}
      <ScrollRestoration />

      {/* Persistent navigation — lives outside AnimatePresence so it never re-mounts */}
      <Navbar />

      {/* Page content — animates on route change, respects reduced-motion */}
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          role="main"
          id="main-content"
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex-1 w-full min-w-0"
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>

      {/* Persistent footer */}
      <Footer />
    </div>
  );
}
