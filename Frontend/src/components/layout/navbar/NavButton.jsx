/**
 * @file NavButton.jsx
 * @module components/layout/navbar
 * ...unchanged JSDoc...
 */
import { Link } from "react-router-dom";
import { cn } from "../../../utils/cn";

const VARIANT_CLASSES = {
  ghost: [
    "text-gray-700 border border-gray-300 bg-transparent",
    "hover:border-gray-400 hover:text-gray-900 hover:bg-gray-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2",
  ].join(" "),
  primary: [
    "text-white bg-primary-500 border border-transparent",
    "hover:bg-primary-600 hover:shadow-primary-glow",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
  ].join(" "),
  success: [
    "text-white bg-secondary-500 border border-transparent",
    "hover:bg-secondary-600 hover:shadow-sm",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary-500 focus-visible:ring-offset-2",
  ].join(" "),
};

const BASE_CLASSES = [
  "inline-flex items-center justify-center",
  "px-4 py-2 rounded-lg",
  "text-sm font-body font-medium",
  "transition-all duration-200",
  "active:scale-[0.97]",
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
].join(" ");

export default function NavButton({
  to,
  label,
  variant = "ghost",
  ariaLabel,
  fullWidth = false,
  onClick,
  className,
}) {
  if (process.env.NODE_ENV !== "production" && !(variant in VARIANT_CLASSES)) {
    console.warn(
      `[NavButton] Unknown variant "${variant}". Fell back to "ghost".`,
    );
  }

  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        BASE_CLASSES,
        VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.ghost,
        fullWidth && "w-full text-center py-3",
        className,
      )}
    >
      {label}
    </Link>
  );
}
