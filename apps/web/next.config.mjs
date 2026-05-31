import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {(phase: string) => import('next').NextConfig} */
export default function nextConfig(phase) {
  return {
    reactStrictMode: true,
    poweredByHeader: false,
    transpilePackages: ["@onlydihs/ui"],
    // Keep dev manifests isolated from `next build`, which can otherwise break a running dev server.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"
  };
}

