/**
 * @file pages/member/SettingsPage.jsx
 * @description Member settings page — DUMMY TEMPLATE.
 *
 * This is a structural scaffold for design review and backend planning.
 * All sections are static — no API calls, no mutations.
 *
 * TODO zones are marked with: // ─── TODO ──────────────
 * Wire each section once the backend controller + DTO are finalised.
 *
 * Proposed sections (discuss and trim/expand before building for real):
 *  1. Account — email, password change
 *  2. Notifications — per-type email/in-app toggles
 *  3. Security — active sessions, 2FA placeholder
 *  4. Danger Zone — deactivate / delete account
 */

import { useState } from "react";
import { useReducedMotion } from "framer-motion";

// ─── Section registry — controls render order and nav ─────────────────────────

const SECTIONS = [
  { id: "account", label: "ACCOUNT", glyph: "◈" },
  { id: "notifications", label: "NOTIFICATIONS", glyph: "◉" },
  { id: "security", label: "SECURITY", glyph: "⚑" },
  { id: "danger", label: "DANGER ZONE", glyph: "✕" },
];

// ─── Reusable layout primitives ───────────────────────────────────────────────

function SectionCard({ id, title, glyph, description, children }) {
  return (
    <section
      id={id}
      style={{
        border: "1px solid var(--border)",
        borderRadius: "6px",
        overflow: "hidden",
        background: "var(--surface)",
        marginBottom: "20px",
      }}
    >
      {/* Card header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-raised, rgba(255,255,255,0.02))",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            color: "var(--muted)",
          }}
        >
          {glyph}
        </span>
        <div>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              letterSpacing: "0.12em",
              color: "var(--foreground)",
              textTransform: "uppercase",
            }}
          >
            {title}
          </p>
          {description && (
            <p
              style={{
                margin: "2px 0 0",
                fontFamily: "var(--font-body)",
                fontSize: "12px",
                color: "var(--muted)",
              }}
            >
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: "20px" }}>{children}</div>
    </section>
  );
}

/** A single labelled field row — read-only display style. */
function FieldRow({ label, value, action }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "12px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: "0.1em",
            color: "var(--muted)",
            textTransform: "uppercase",
            marginBottom: "2px",
          }}
        >
          {label}
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-body)",
            fontSize: "13.5px",
            color: "var(--foreground)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </p>
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

/** Ghost button — used for non-destructive actions. */
function GhostBtn({ onClick, color = "var(--foreground)", children }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: hover ? "#fff" : color,
        background: hover ? color : "transparent",
        border: `1px solid ${color}66`,
        borderRadius: "3px",
        padding: "5px 12px",
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/** Toggle switch — static/uncontrolled for now. */
function Toggle({ defaultOn = false, disabled = false }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => !disabled && setOn((v) => !v)}
      style={{
        position: "relative",
        width: "36px",
        height: "20px",
        borderRadius: "10px",
        border: "none",
        background: on ? "var(--tam-green)" : "var(--border)",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
        transition: "background 0.2s",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "3px",
          left: on ? "19px" : "3px",
          width: "14px",
          height: "14px",
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          display: "block",
        }}
      />
    </button>
  );
}

/** Toggle row — label + description + toggle. */
function ToggleRow({ label, description, defaultOn, disabled }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "12px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-body)",
            fontSize: "13.5px",
            color: "var(--foreground)",
            fontWeight: 500,
          }}
        >
          {label}
        </p>
        {description && (
          <p
            style={{
              margin: "2px 0 0",
              fontFamily: "var(--font-body)",
              fontSize: "12px",
              color: "var(--muted)",
            }}
          >
            {description}
          </p>
        )}
      </div>
      <Toggle defaultOn={defaultOn} disabled={disabled} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const reduced = useReducedMotion();
  const [activeSection, setActiveSection] = useState("account");

  return (
    <>
      <style>{`
        @keyframes tam-slide-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        style={{
          minHeight: "100%",
          background: "var(--page-bg, var(--background))",
          fontFamily: "var(--font-body)",
        }}
      >
        {/* ── Page header ────────────────────────────────────────────────── */}
        <header
          style={{
            padding: "28px 28px 0",
            marginBottom: "24px",
            animation: reduced ? "none" : "tam-slide-in 0.35s ease both",
          }}
        >
          <p
            style={{
              margin: "0 0 4px",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              letterSpacing: "0.16em",
              color: "var(--muted)",
              textTransform: "uppercase",
            }}
          >
            MEMBER PORTAL · CONFIGURATION
          </p>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-mono)",
              fontSize: "clamp(20px, 3vw, 26px)",
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "var(--foreground)",
            }}
          >
            SETTINGS
          </h1>
        </header>

        {/* ── Body — sidebar nav + content ───────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            gap: "0 24px",
            padding: "0 28px 40px",
            alignItems: "start",
            animation: reduced ? "none" : "tam-slide-in 0.4s ease 0.05s both",
          }}
        >
          {/* Sidebar nav */}
          <nav
            aria-label="Settings sections"
            style={{
              position: "sticky",
              top: "24px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              overflow: "hidden",
              background: "var(--surface)",
            }}
          >
            {SECTIONS.map((s) => {
              const isActive = activeSection === s.id;
              const isDanger = s.id === "danger";
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveSection(s.id);
                    document
                      .getElementById(s.id)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "11px 14px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    textAlign: "left",
                    background: isActive
                      ? "rgba(220,38,38,0.06)"
                      : "transparent",
                    borderLeft: isActive
                      ? "2px solid var(--tam-red)"
                      : "2px solid transparent",
                    borderRight: "none",
                    borderTop: "none",
                    borderBottom: "1px solid var(--border)",
                    color: isDanger
                      ? "var(--tam-red)"
                      : isActive
                        ? "var(--foreground)"
                        : "var(--muted)",
                    cursor: "pointer",
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  <span>{s.glyph}</span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Content column */}
          <div>
            {/* ── 1. Account ──────────────────────────────────────────────── */}
            <SectionCard
              id="account"
              glyph="◈"
              title="Account"
              description="Your login credentials and identity."
            >
              {/* TODO: populate from auth user object (req.user or auth context) */}
              <FieldRow
                label="Email address"
                value="member@example.com"
                action={<GhostBtn color="var(--tam-red)">Change</GhostBtn>}
              />
              <FieldRow
                label="Password"
                value="••••••••••••"
                action={<GhostBtn color="var(--tam-red)">Update</GhostBtn>}
              />
              <FieldRow label="Member since" value="01 JAN 2024" />
              {/* TODO: last row — remove borderBottom */}
              <FieldRow label="Account status" value="Active" />
            </SectionCard>

            {/* ── 2. Notifications ────────────────────────────────────────── */}
            <SectionCard
              id="notifications"
              glyph="◉"
              title="Notifications"
              description="Control how and when TAM contacts you."
            >
              {/* TODO: wire to notificationPreferences field on the member/user model */}
              {/* TODO: decide whether these are email, in-app, or both — needs backend decision */}
              <p
                style={{
                  margin: "0 0 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.1em",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                }}
              >
                In-app
              </p>
              <ToggleRow
                label="Document updates"
                description="When a document is approved or rejected."
                defaultOn={true}
              />
              <ToggleRow
                label="Account alerts"
                description="Status changes, verification milestones."
                defaultOn={true}
              />
              <ToggleRow
                label="TAM broadcasts"
                description="Industry notices and announcements."
                defaultOn={false}
              />

              <p
                style={{
                  margin: "20px 0 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.1em",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                }}
              >
                Email{" "}
                {/* TODO: implement email notification delivery on the backend first */}
              </p>
              <ToggleRow
                label="Email notifications"
                description="Receive a summary email for important events."
                defaultOn={false}
                disabled={true}
              />
              <p
                style={{
                  margin: "8px 0 0",
                  fontFamily: "var(--font-body)",
                  fontSize: "11.5px",
                  color: "var(--muted)",
                  fontStyle: "italic",
                }}
              >
                Email delivery coming soon.
              </p>
            </SectionCard>

            {/* ── 3. Security ─────────────────────────────────────────────── */}
            <SectionCard
              id="security"
              glyph="⚑"
              title="Security"
              description="Sessions and authentication settings."
            >
              {/* TODO: implement active session listing on the backend */}
              <FieldRow
                label="Current session"
                value="Chrome · Blantyre, MW"
                action={<GhostBtn color="var(--muted)">Sign out</GhostBtn>}
              />
              <FieldRow
                label="Two-factor authentication"
                value="Not enabled"
                action={
                  // TODO: implement 2FA — placeholder only
                  <GhostBtn color="var(--tam-green)">Enable</GhostBtn>
                }
              />
              <FieldRow label="Last login" value="11 MAY 2026 · 09:14" />
            </SectionCard>

            {/* ── 4. Danger Zone ──────────────────────────────────────────── */}
            <SectionCard
              id="danger"
              glyph="✕"
              title="Danger Zone"
              description="Irreversible account actions."
            >
              {/* TODO: implement deactivation + deletion endpoints on the backend */}
              {/* TODO: deactivation should require admin confirmation flow */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                  padding: "14px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-body)",
                      fontSize: "13.5px",
                      color: "var(--foreground)",
                      fontWeight: 500,
                    }}
                  >
                    Deactivate account
                  </p>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontFamily: "var(--font-body)",
                      fontSize: "12px",
                      color: "var(--muted)",
                    }}
                  >
                    Temporarily suspend your TAM membership. Reactivation
                    requires secretariat review.
                  </p>
                </div>
                <GhostBtn color="var(--amber, #d97706)">Deactivate</GhostBtn>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                  padding: "14px 0",
                }}
              >
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-body)",
                      fontSize: "13.5px",
                      color: "var(--tam-red)",
                      fontWeight: 600,
                    }}
                  >
                    Delete account
                  </p>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontFamily: "var(--font-body)",
                      fontSize: "12px",
                      color: "var(--muted)",
                    }}
                  >
                    Permanently remove your profile, documents, and membership
                    record. Cannot be undone.
                  </p>
                </div>
                <GhostBtn color="var(--tam-red)">Delete</GhostBtn>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </>
  );
}
