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
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium",
        "transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4afb0]/45",
        variant === "default" &&
          "bg-gradient-to-r from-[#f4afb0] via-[#d7b355] to-[#c5986f] text-[#110d0c] shadow-[0_0_0_1px_rgba(254,254,254,0.13)] hover:brightness-105",
        variant === "secondary" && "bg-white/10 text-white hover:bg-white/15",
        variant === "ghost" && "bg-transparent text-white/80 hover:bg-white/10",
        className ?? ""
      )}
      {...props}
    />
  );
}

