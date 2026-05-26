import * as React from "react";

export function GradientText({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={[
        "bg-gradient-to-r from-fuchsia-300 via-purple-300 to-cyan-200 bg-clip-text text-transparent",
        className ?? ""
      ].join(" ")}
    >
      {children}
    </span>
  );
}

