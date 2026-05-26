"use client";

import * as React from "react";
import { cn } from "../utils/cn";

type ButtonVariant = "default" | "ghost" | "secondary";

export function Button({
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium",
        "transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300/40",
        variant === "default" &&
          "bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-400 text-black shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
        variant === "secondary" && "bg-white/10 text-white hover:bg-white/15",
        variant === "ghost" && "bg-transparent text-white/80 hover:bg-white/10",
        className ?? ""
      )}
      {...props}
    />
  );
}

