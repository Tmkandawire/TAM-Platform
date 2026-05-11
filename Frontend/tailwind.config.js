/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // TAM Brand Colours
        primary: {
          50: "#FDECEA",
          100: "#F9D2CD",
          200: "#F4B5AD",
          300: "#EE978C",
          400: "#EB7F72",
          500: "#EA4335", // Primary red
          600: "#D93025",
          700: "#B3261E",
          800: "#8C1D18",
          900: "#641510",
        },

        secondary: {
          50: "#EAF6ED",
          100: "#CDEAD5",
          200: "#A7DBB5",
          300: "#7BCB92",
          400: "#56BD75",
          500: "#34A853", // Primary green
          600: "#2E9449",
          700: "#267B3D",
          800: "#1D6130",
          900: "#154824",
        },

        // Semantic status colours
        status: {
          pending: "#F59E0B",
          approved: "#34A853",
          rejected: "#EA4335",
          expired: "#6B7280",
        },
      },

      fontFamily: {
        display: ["'Playfair Display'", "Georgia", "serif"],
        body: ["'DM Sans'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },

      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1" }], // 10px — wordmark subtitle
      },

      backgroundImage: {
        "primary-gradient": "linear-gradient(135deg, #EA4335 0%, #D93025 100%)",

        "secondary-gradient":
          "linear-gradient(135deg, #34A853 0%, #2E9449 100%)",

        "hero-pattern":
          "radial-gradient(ellipse at top, #EA4335 0%, #8C1D18 70%)",
      },

      boxShadow: {
        "primary-glow": "0 0 20px rgba(234, 67, 53, 0.35)",
        "primary-deep": "0 25px 60px rgba(140, 29, 24, 0.35)",
        card: "0 4px 24px rgba(10, 22, 40, 0.08)",
        "card-hover": "0 8px 40px rgba(10, 22, 40, 0.15)",
      },

      animation: {
        "fade-up": "fadeUp 0.6s ease forwards",
        "fade-in": "fadeIn 0.4s ease forwards",
        shimmer: "shimmer 1.5s infinite",
        "pulse-primary": "pulsePrimary 2s ease-in-out infinite",
      },

      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },

        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },

        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },

        pulsePrimary: {
          "0%, 100%": {
            boxShadow: "0 0 0 0 rgba(234, 67, 53, 0.4)",
          },

          "50%": {
            boxShadow: "0 0 0 8px rgba(234, 67, 53, 0)",
          },
        },
      },
    },
  },
  plugins: [],
};
