import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SizeAI",
  description: "Entertainment-only creator subscriptions and private AI anatomy scoring."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  );
}

