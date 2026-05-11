/**
 * @file TAMLogo.jsx
 * @module components/layout/navbar
 *
 * TAM wordmark / logo component.
 *
 * Extracted as its own component so it can be reused in both
 * Navbar and Footer without duplication, and replaced with a real
 * SVG/PNG logo in a single place when one becomes available.
 *
 * @param {{ className?: string }} props
 */
import { Link } from "react-router-dom";
import { Truck } from "lucide-react";
import { cn } from "../../../utils/cn";

export default function TAMLogo({ className }) {
  return (
    <Link
      to="/"
      aria-label="TAM — Transporters Association of Malawi, go to home page"
      className={cn(
        "flex items-center gap-2.5 group flex-shrink-0",
        "rounded-md focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
        className,
      )}
    >
      {/* Icon mark — replace inner content with <img> when real logo is available */}
      <div
        aria-hidden="true"
        className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-primary-500 shadow-sm group-hover:bg-primary-600 transition-colors duration-200"
      >
        <Truck className="w-5 h-5 text-white" strokeWidth={2} />
      </div>

      {/* Wordmark */}
      <div className="flex flex-col leading-none" aria-hidden="true">
        <span className="font-display font-bold text-xl text-gray-900 tracking-tight">
          TAM
        </span>
        <span className="text-2xs font-body font-medium text-secondary-600 tracking-widest uppercase leading-none">
          Malawi
        </span>
      </div>
    </Link>
  );
}
