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
        "bg-gradient-to-r from-[#f4afb0] via-[#d7b355] to-[#c5986f] bg-clip-text text-transparent",
        className ?? ""
      ].join(" ")}
    >
      {children}
    </span>
  );
}

