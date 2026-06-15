"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export function PhaseShell({ children }: { children: ReactNode }) {
  return (
    <div className="honey-shell">
      <header className="sticky top-0 z-30 border-b border-[#d6a72f]/20 bg-[#fffdf8]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight text-[#16120c]">
            <span className="rounded-md border border-[#d6a72f]/35 bg-white p-1 shadow-sm">
              <Image src="/brand/onlydihs-logo.png" alt="" width={30} height={30} className="h-7 w-7 rounded" priority />
            </span>
            <span>OnlyDihs</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm text-[#5f3f16]">
            <Link href="/analyzer" className="rounded-md px-3 py-2 hover:bg-[#d6a72f]/15">Analyzer</Link>
            <Link href="/profile" className="rounded-md px-3 py-2 hover:bg-[#d6a72f]/15">Profile</Link>
            <Link href="/settings" className="rounded-md px-3 py-2 hover:bg-[#d6a72f]/15">Settings</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`honey-panel ${className}`}>{children}</div>;
}
