import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sora: ["var(--font-sora)", "sans-serif"],
      },
      colors: {
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
      },
    },
  },
  plugins: [],
};

export default config;
