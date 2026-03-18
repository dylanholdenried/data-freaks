/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1200px"
      }
    },
    extend: {
      colors: {
        border: "hsl(214 15% 90%)",
        input: "hsl(214 15% 90%)",
        ring: "hsl(214 84% 56%)",
        background: "#ffffff",
        foreground: "hsl(222.2 47.4% 11.2%)",
        primary: {
          DEFAULT: "hsl(214 84% 56%)",
          foreground: "#ffffff"
        },
        secondary: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(222.2 47.4% 11.2%)"
        },
        destructive: {
          DEFAULT: "hsl(0 84% 60%)",
          foreground: "#ffffff"
        },
        muted: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(215 16.3% 46.9%)"
        },
        accent: {
          DEFAULT: "hsl(210 40% 96%)",
          foreground: "hsl(222.2 47.4% 11.2%)"
        },
        card: {
          DEFAULT: "#ffffff",
          foreground: "hsl(222.2 47.4% 11.2%)"
        }
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem"
      },
      boxShadow: {
        card: "0 10px 30px rgba(15, 23, 42, 0.08)"
      },
      fontFamily: {
        sans: ["system-ui", "ui-sans-serif", "sans-serif"]
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;

