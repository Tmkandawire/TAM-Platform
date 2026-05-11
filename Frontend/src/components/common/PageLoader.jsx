/**
 * @file PageLoader.jsx
 * @module components/common
 *
 * Full-page loader shown during:
 *  - Route-level lazy load suspense (AppRouter)
 *  - Auth hydration (ProtectedRoute waiting for isHydrated)
 *
 * Uses TAM brand colours — Primary Red #EA4335, Secondary Green #34A853,
 * dark background gray-950 — consistent with the public page hero sections.
 */
export default function PageLoader() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6">
      {/* TAM logo mark */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-16 h-16 rounded-2xl bg-primary-500 flex items-center justify-center shadow-lg shadow-primary-900/50">
          {/* Subtle inner glow ring */}
          <div className="absolute inset-0 rounded-2xl ring-2 ring-primary-400/30" />
          <span className="relative font-display font-bold text-2xl text-white tracking-tight">
            TAM
          </span>
        </div>
        <span className="font-display text-gray-300 text-sm tracking-[0.2em] uppercase">
          Transporters Association of Malawi
        </span>
      </div>

      {/* Shimmer loading bar */}
      <div className="w-48 h-0.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            animation: "tam-shimmer 1.6s ease-in-out infinite",
            background:
              "linear-gradient(90deg, transparent 0%, #EA4335 40%, #34A853 60%, transparent 100%)",
            backgroundSize: "200% 100%",
          }}
        />
      </div>

      {/*
       * Shimmer keyframe — defined inline so this component is self-contained
       * and works without any Tailwind animation extension.
       * Moves the gradient from left (-100%) to right (+100%).
       */}
      <style>{`
        @keyframes tam-shimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
    </div>
  );
}
