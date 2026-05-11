/**
 * @file Footer.jsx
 * @module components/layout
 *
 * TAM Public Footer
 *
 * Responsibilities
 * ─────────────────────────────────────────────
 * - Three-column layout: Brand | Quick Links | Contact
 * - External government/partner links (open in new tab, noopener)
 * - Social media placeholders (conditionally hidden until URLs are set)
 * - Bottom bar: copyright + secondary links
 * - Fully accessible: landmark role, aria-labels, focus-visible rings on all links
 * - Responsive: stacks to single column on mobile
 *
 * Design:
 *   Near-black charcoal (#111827) base with red and green accent details.
 *   Subtle top border in primary red reinforces brand consistency with navbar.
 *
 * Logo:
 *   Uses TAMLogo with variant="footer" — single source of truth for brand identity.
 *   Update TAMLogo.jsx to change the logo everywhere at once.
 */

import { Link } from "react-router-dom";
import { MapPin, Phone, Mail, ExternalLink } from "lucide-react";

import { FaFacebookF, FaXTwitter, FaLinkedinIn } from "react-icons/fa6";
import TAMLogo from "../layout/navbar/TAMLogo";

// ─── Data ─────────────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: "Home", path: "/" },
  { label: "About Us", path: "/about" },
  { label: "Services", path: "/services" },
  { label: "Contact", path: "/contact" },
  { label: "Register", path: "/register" },
  { label: "Login", path: "/login" },
];

const PARTNER_LINKS = [
  { label: "Road Traffic & Safety Services", url: "https://www.rtss.mw" },
  { label: "MACRA", url: "https://www.macra.mw" },
  {
    label: "MERA — Malawi Energy Regulatory Authority",
    url: "https://www.mera.mw",
  },
  { label: "PIL — Petroleum Importers Ltd", url: "https://www.pil.mw" },
  { label: "Ministry of Transport", url: "https://www.mot.gov.mw" },
  {
    label: "Dept. of Immigration & Citizenship",
    url: "https://www.immigration.gov.mw",
  },
  { label: "Malawi Police Service", url: "https://www.police.gov.mw" },
];

/**
 * Social media platforms.
 * Set url to null (not "#") for platforms that don't exist yet.
 * Entries with url: null are filtered out and never rendered —
 * avoids dead links and preserves screen reader integrity.
 */
const SOCIAL_LINKS = [
  { label: "Facebook", icon: FaFacebookF, url: null },
  { label: "Twitter / X", icon: FaXTwitter, url: null },
  { label: "LinkedIn", icon: FaLinkedinIn, url: null },
];
// ─── Sub-components ───────────────────────────────────────────────────────────

function FooterHeading({ children }) {
  return (
    <h3 className="font-body font-semibold text-white text-sm uppercase tracking-widest mb-5 flex items-center gap-2">
      <span className="inline-block w-5 h-0.5 bg-primary-500 rounded-full" />
      {children}
    </h3>
  );
}

function ExternalFooterLink({ href, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens in new tab)`}
      className="
        flex items-start gap-1.5 text-gray-400 text-sm font-body
        hover:text-secondary-400 transition-colors duration-200 group
        rounded focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-primary-500 focus-visible:ring-offset-2
        focus-visible:ring-offset-gray-900
      "
    >
      <ExternalLink
        className="w-3 h-3 mt-0.5 flex-shrink-0 text-gray-600 group-hover:text-secondary-500 transition-colors duration-200"
        aria-hidden="true"
      />
      {label}
    </a>
  );
}

function FooterNavLink({ path, label }) {
  return (
    <Link
      to={path}
      className="
        text-gray-400 text-sm font-body hover:text-white
        transition-colors duration-200 flex items-center gap-1.5 group
        rounded focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-primary-500 focus-visible:ring-offset-2
        focus-visible:ring-offset-gray-900
      "
    >
      <span
        className="
          inline-block w-1 h-1 rounded-full bg-primary-500 flex-shrink-0
          group-hover:bg-secondary-400 transition-colors duration-200
        "
        aria-hidden="true"
      />
      {label}
    </Link>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Footer() {
  const currentYear = new Date().getFullYear();

  // Only render social icons that have real URLs — never render dead "#" links
  const activeSocialLinks = SOCIAL_LINKS.filter(({ url }) => url !== null);

  return (
    <footer
      role="contentinfo"
      aria-label="Site footer"
      className="bg-gray-900 border-t-4 border-primary-500"
    >
      {/* ── Main footer grid ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          {/* ── Column 1: Brand & About ── */}
          <div className="lg:col-span-1">
            {/*
             * TAMLogo handles its own link, aria-label, and focus ring.
             * variant="footer" renders white wordmark text for the dark background.
             * When the real logo asset arrives, update TAMLogo.jsx — it changes here too.
             */}
            <div className="mb-5">
              <TAMLogo variant="footer" />
            </div>

            <p className="text-gray-400 text-sm font-body leading-relaxed mb-6">
              Empowering the nation through reliable transport solutions.
              Malawi's leading member-based transport association since 2003.
            </p>

            {/* Social icons — only rendered when real URLs exist */}
            {activeSocialLinks.length > 0 && (
              <div
                className="flex items-center gap-3"
                role="list"
                aria-label="Social media links"
              >
                {activeSocialLinks.map(({ label, icon: Icon, url }) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    role="listitem"
                    aria-label={`${label} (opens in new tab)`}
                    className="
                      flex items-center justify-center w-9 h-9 rounded-lg
                      bg-gray-800 text-gray-400 border border-gray-700
                      hover:bg-primary-500 hover:text-white hover:border-primary-500
                      transition-all duration-200
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-primary-500 focus-visible:ring-offset-2
                      focus-visible:ring-offset-gray-900
                    "
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* ── Column 2: Quick Links ── */}
          <div>
            <FooterHeading>Quick Links</FooterHeading>
            <ul className="space-y-3" role="list">
              {QUICK_LINKS.map(({ path, label }) => (
                <li key={path} role="listitem">
                  <FooterNavLink path={path} label={label} />
                </li>
              ))}
            </ul>
          </div>

          {/* ── Column 3: Partners & Regulators ── */}
          <div>
            <FooterHeading>Partners & Regulators</FooterHeading>
            <ul className="space-y-3" role="list">
              {PARTNER_LINKS.map(({ label, url }) => (
                <li key={label} role="listitem">
                  <ExternalFooterLink href={url} label={label} />
                </li>
              ))}
            </ul>
          </div>

          {/* ── Column 4: Contact Information ── */}
          <div>
            <FooterHeading>Contact Us</FooterHeading>
            <address className="not-italic space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center mt-0.5">
                  <MapPin
                    className="w-4 h-4 text-primary-400"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="text-white text-sm font-body font-medium mb-0.5">
                    Physical Address
                  </p>
                  <p className="text-gray-400 text-sm font-body leading-relaxed">
                    Kanengo Industrial Area
                    <br />
                    TCC Complex, 1st Floor, Room 65
                    <br />
                    Lilongwe, Malawi
                  </p>
                  <p className="text-gray-500 text-xs font-body mt-1">
                    P.O. Box 40644, Kanengo, Lilongwe 4
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                  <Phone
                    className="w-4 h-4 text-secondary-400"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="text-white text-sm font-body font-medium mb-0.5">
                    Phone
                  </p>
                  <a
                    href="tel:+265891003936"
                    className="
                      text-gray-400 text-sm font-body hover:text-secondary-400
                      transition-colors duration-200 block rounded
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-primary-500 focus-visible:ring-offset-2
                      focus-visible:ring-offset-gray-900
                    "
                  >
                    +265 891 003 936
                  </a>
                  <a
                    href="tel:+265981003936"
                    className="
                      text-gray-400 text-sm font-body hover:text-secondary-400
                      transition-colors duration-200 block rounded
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-primary-500 focus-visible:ring-offset-2
                      focus-visible:ring-offset-gray-900
                    "
                  >
                    +265 981 003 936
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                  <Mail
                    className="w-4 h-4 text-primary-400"
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <p className="text-white text-sm font-body font-medium mb-0.5">
                    Email
                  </p>
                  <a
                    href="mailto:info@transportersmw.com"
                    className="
                      text-gray-400 text-sm font-body hover:text-primary-400
                      transition-colors duration-200 block rounded
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-primary-500 focus-visible:ring-offset-2
                      focus-visible:ring-offset-gray-900
                    "
                  >
                    info@transportersmw.com
                  </a>
                  <a
                    href="mailto:admin@transportersmw.com"
                    className="
                      text-gray-400 text-sm font-body hover:text-primary-400
                      transition-colors duration-200 block rounded
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-primary-500 focus-visible:ring-offset-2
                      focus-visible:ring-offset-gray-900
                    "
                  >
                    admin@transportersmw.com
                  </a>
                </div>
              </div>
            </address>
          </div>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-gray-500 text-xs font-body text-center sm:text-left">
              © {currentYear}{" "}
              <span className="text-gray-400">
                Transporters Association of Malawi (TAM)
              </span>
              . All rights reserved.
            </p>

            <div className="flex items-center gap-5">
              <Link
                to="/privacy"
                className="
                  text-gray-500 text-xs font-body hover:text-gray-300
                  transition-colors duration-200 rounded
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-primary-500 focus-visible:ring-offset-2
                  focus-visible:ring-offset-gray-900
                "
              >
                Privacy Policy
              </Link>
              <Link
                to="/terms"
                className="
                  text-gray-500 text-xs font-body hover:text-gray-300
                  transition-colors duration-200 rounded
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-primary-500 focus-visible:ring-offset-2
                  focus-visible:ring-offset-gray-900
                "
              >
                Terms of Use
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
