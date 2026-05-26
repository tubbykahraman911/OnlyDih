"use client";

import * as React from "react";
import Link from "next/link";
import { AdultGate } from "../../components/AdultGate";
import { apiFetch } from "../../lib/apiClient";
import { GlassCard } from "@sizeai/ui";

type ThreadItem = {
  id: string;
  creatorId: string;
  fanId: string;
  creator: { id: string; handle?: string | null; badgeLevel?: string | null };
  fan: { id: string; handle?: string | null };
  lastMessage: null | {
    id: string;
    senderId: string;
    createdAt: string;
    body: string | null;
    isLocked: boolean;
    attachmentMediaId: string | null;
  };
};

function MessagesInner() {
  const [items, setItems] = React.useState<ThreadItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<{ items: ThreadItem[] }>("/chats");
      setItems(res.items ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load chats");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  if (loading) return <div className="mx-auto max-w-3xl p-4 text-white/70">Loading...</div>;
  if (err) return <div className="mx-auto max-w-3xl p-4 text-red-300">{err}</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      {items.map((t) => (
        <Link key={t.id} href={`/messages/${t.id}`}>
          <GlassCard className="cursor-pointer p-5 transition active:scale-[0.99]">
            <div className="text-sm text-white/70">@{t.creator.handle ?? "creator"}</div>
            <div className="mt-1 text-sm text-white/90">
              {t.lastMessage
                ? t.lastMessage.isLocked
                  ? "Locked PPV message"
                  : t.lastMessage.body ?? ""
                : "No messages yet"}
            </div>
          </GlassCard>
        </Link>
      ))}
      {!items.length ? <div className="text-white/70">No threads yet.</div> : null}
    </div>
  );
}

export default function MessagesPage() {
  return (
    <AdultGate>
      <MessagesInner />
    </AdultGate>
  );
}

