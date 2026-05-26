import * as React from "react";

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div
      className={[
        "h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60",
        className ?? ""
      ].join(" ")}
    />
  );
}

