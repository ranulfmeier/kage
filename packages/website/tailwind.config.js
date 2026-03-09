/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        kage: {
          50: "#f7f7f8",
          100: "#ecedf0",
          200: "#d5d7de",
          300: "#b0b4c1",
          400: "#858b9e",
          500: "#666d83",
          600: "#51566b",
          700: "#434758",
          800: "#3a3d4a",
          900: "#1a1a2e",
          950: "#0f0f1a",
        },
        accent: {
          50: "#fef2f3",
          100: "#fde6e8",
          200: "#fbd0d5",
          300: "#f8aab4",
          400: "#f27a8a",
          500: "#e94560",
          600: "#d62548",
          700: "#b41b3c",
          800: "#961938",
          900: "#801936",
        },
        ink: {
          50: "#f6f6f7",
          100: "#e3e3e5",
          200: "#c6c6cb",
          300: "#a2a2aa",
          400: "#7d7d88",
          500: "#62626d",
          600: "#4d4d57",
          700: "#3f3f47",
          800: "#35353b",
          900: "#16213e",
          950: "#0d0d12",
        },
        paper: {
          50: "#fafafa",
          100: "#f5f5f5",
          200: "#edf2f4",
          300: "#e5e5e5",
          400: "#d4d4d4",
          500: "#a3a3a3",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Outfit", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        japanese: ["Noto Sans JP", "sans-serif"],
      },
      animation: {
        "float": "float 6s ease-in-out infinite",
        "pulse-soft": "pulse-soft 4s ease-in-out infinite",
        "gradient": "gradient 8s ease infinite",
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "fade-in-up": "fadeInUp 0.6s ease-out forwards",
        "fade-in-down": "fadeInDown 0.5s ease-out forwards",
        "slide-in-left": "slideInLeft 0.6s ease-out forwards",
        "slide-in-right": "slideInRight 0.6s ease-out forwards",
        "scale-in": "scaleIn 0.5s ease-out forwards",
        "shadow-pulse": "shadowPulse 3s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-20px)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.7 },
        },
        gradient: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        fadeInUp: {
          "0%": { opacity: 0, transform: "translateY(30px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        fadeInDown: {
          "0%": { opacity: 0, transform: "translateY(-20px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        slideInLeft: {
          "0%": { opacity: 0, transform: "translateX(-40px)" },
          "100%": { opacity: 1, transform: "translateX(0)" },
        },
        slideInRight: {
          "0%": { opacity: 0, transform: "translateX(40px)" },
          "100%": { opacity: 1, transform: "translateX(0)" },
        },
        scaleIn: {
          "0%": { opacity: 0, transform: "scale(0.9)" },
          "100%": { opacity: 1, transform: "scale(1)" },
        },
        shadowPulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(233, 69, 96, 0)" },
          "50%": { boxShadow: "0 0 40px 10px rgba(233, 69, 96, 0.15)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      boxShadow: {
        'kage': '0 25px 50px -12px rgba(26, 26, 46, 0.35)',
        'kage-lg': '0 35px 60px -15px rgba(26, 26, 46, 0.4)',
        'inner-glow': 'inset 0 2px 20px 0 rgba(233, 69, 96, 0.1)',
        'accent-glow': '0 0 40px -10px rgba(233, 69, 96, 0.5)',
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
};
