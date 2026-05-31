import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "OnlyDihs",
  description: "Private adult-only Phase 1 analyzer with verification, consent, and deletion controls.",
  icons: {
    icon: "/brand/onlydihs-logo.png"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}

