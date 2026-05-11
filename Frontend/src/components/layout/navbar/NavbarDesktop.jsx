/**
 * @file NavbarDesktop.jsx
 * @module components/layout/navbar
 *
 * Desktop navbar UI — purely presentational.
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 *  • Renders horizontal nav links with active-route indicator
 *  • Renders CTA button row using NavButton abstraction
 *  • No state, no effects — all behaviour lives in useNavbar
 *
 * Visibility:
 *   Hidden on mobile (hidden lg:flex) — NavbarMobile handles smaller screens.
 */
import { NavLink } from "react-router-dom";
import { NAV_LINKS, CTA_BUTTONS } from "./navbar.config";
import NavButton from "./NavButton";
import { cn } from "../../../utils/cn";

// ─── Sub-components ───────────────────────────────────────────────────────────
/**
 * Individual desktop nav link.
 * Active state: red text + animated underline bar.
 * Hover state:  dark text + underline animates in from left.
 * Focus state:  visible ring for keyboard users.
 */
function DesktopNavLink({ path, label, end }) {
  return (
    <NavLink
      to={path}
      end={end}
      className={({ isActive }) =>
        cn(
          // Base
          "relative py-1 text-sm font-body font-medium",
          "transition-colors duration-200",
          // Underline pseudo-element via after:
          "after:absolute after:bottom-0 after:left-0",
          "after:h-0.5 after:rounded-full",
          "after:transition-all after:duration-200",
          // Keyboard focus ring — only on keyboard nav, not mouse click
          "rounded-sm",
          "focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          // Active vs idle
          isActive
            ? "text-primary-500 after:w-full after:bg-primary-500"
            : "text-gray-600 hover:text-gray-900 after:w-0 hover:after:w-full after:bg-primary-400",
        )
      }
    >
      {label}
    </NavLink>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function NavbarDesktop() {
  return (
    <>
      {/* Navigation links */}
      <ul
        className="hidden lg:flex items-center gap-8"
        role="list"
        aria-label="Primary navigation"
      >
        {NAV_LINKS.map(({ path, label, end }) => (
          <li key={path}>
            <DesktopNavLink path={path} label={label} end={end} />
          </li>
        ))}
      </ul>
      {/* CTA buttons */}
      <div
        className="hidden lg:flex items-center gap-3"
        role="group"
        aria-label="Account actions"
      >
        {CTA_BUTTONS.map(({ label, path, variant, ariaLabel }) => (
          <NavButton
            key={label}
            to={path}
            label={label}
            variant={variant}
            ariaLabel={ariaLabel}
          />
        ))}
      </div>
    </>
  );
}
