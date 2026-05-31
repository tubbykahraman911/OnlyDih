import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 0 0 1px rgba(254,254,254,0.07), 0 18px 50px rgba(244,175,176,0.12), 0 0 36px rgba(215,179,85,0.08)"
      }
    }
  },
  plugins: []
};

export default config;

