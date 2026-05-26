 "use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Button, GlassCard } from "@sizeai/ui";

export function PremiumHero() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mt-10"
    >
      <GlassCard className="p-6 md:p-8 shadow-glow">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-white/70">For consenting adults, 18+ only</div>
          <div className="text-2xl font-semibold tracking-tight md:text-3xl">
            Private AI confidence scoring
            <span className="ml-2 bg-gradient-to-r from-fuchsia-300 via-purple-300 to-cyan-200 bg-clip-text text-transparent">
              (entertainment)
            </span>
          </div>
          <p className="text-white/70">
            Glassmorphism vibes, creator subscriptions, PPV, tips, and DMs—plus a humorous,
            confidence-oriented report. No medical claims.
          </p>
          <div className="pt-2">
            <Button type="button" className="w-fit">
              Enter (MVP)
            </Button>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

