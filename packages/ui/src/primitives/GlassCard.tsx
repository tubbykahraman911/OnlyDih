import * as React from "react";

export function GlassCard({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-[#fefefe]/10 bg-[#fefefe]/[0.045] backdrop-blur-xl",
        "shadow-[0_0_0_1px_rgba(197,152,111,0.06)]",
        className ?? ""
      ].join(" ")}
    >
      {children}
    </div>
  );
}

