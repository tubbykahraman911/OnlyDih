"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export function PhaseShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#101114] text-zinc-100">
      <header className="border-b border-white/10 bg-[#101114]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Image src="/brand/onlydihs-logo.png" alt="" width={30} height={30} className="h-7 w-7 rounded-md" priority />
            <span>OnlyDihs</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm text-zinc-300">
            <Link href="/analyzer" className="hover:text-white">Analyzer</Link>
            <Link href="/profile" className="hover:text-white">Profile</Link>
            <Link href="/settings" className="hover:text-white">Settings</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-white/10 bg-white/[0.04] p-5 ${className}`}>{children}</div>;
}
