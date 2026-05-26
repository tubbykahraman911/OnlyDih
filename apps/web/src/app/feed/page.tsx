"use client";

import * as React from "react";
import { AdultGate } from "../../components/AdultGate";
import { apiFetch } from "../../lib/apiClient";
import { Button, GlassCard } from "@sizeai/ui";

type FeedMedia = { id: string; mimeType?: string | null; signedGetUrl: string };
type FeedItem = {
  id: string;
  text?: string | null;
  visibility: string;
  ppvPriceCents?: number | null;
  createdAt: string;
  likesCount: number;
  likedByViewer: boolean;
  creator: { handle?: string | null; badgeLevel?: string | null };
  media: FeedMedia[];
};

function FeedCard({ item, onLike }: { item: FeedItem; onLike: () => Promise<void> }) {
  const [commentText, setCommentText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function like() {
    setBusy(true);
    try {
      await apiFetch(`/posts/${item.id}/like`, { method: "POST", body: JSON.stringify({}) });
      await onLike();
    } finally {
      setBusy(false);
    }
  }

  async function comment() {
    const text = commentText.trim();
    if (!text) return;
    setBusy(true);
    try {
      await apiFetch(`/posts/${item.id}/comment`, {
        method: "POST",
        body: JSON.stringify({ text })
      });
      setCommentText("");
      await onLike();
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-white/70">
            by @{item.creator.handle ?? "creator"}
          </div>
          <div className="mt-1 text-sm text-white/90">{item.text ?? ""}</div>
        </div>
        <div className="text-xs text-white/50">{new Date(item.createdAt).toLocaleDateString()}</div>
      </div>

      {item.media.length ? (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {item.media.map((m) => (
            <div key={m.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.signedGetUrl} alt="media" className="h-auto w-full object-cover" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-white/70">{item.likesCount} likes</div>
        <Button variant="secondary" onClick={like} disabled={busy} className="rounded-xl">
          {item.likedByViewer ? "Unlike" : "Like"}
        </Button>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Leave a comment"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-300/40"
        />
        <Button onClick={comment} disabled={busy} className="rounded-xl">
          Comment
        </Button>
      </div>
    </GlassCard>
  );
}

function FeedInner() {
  const [items, setItems] = React.useState<FeedItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch<{ items: FeedItem[] }>("/feed?limit=10");
      setItems(data.items ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return <div className="mx-auto max-w-3xl p-4 text-white/70">Loading feed...</div>;
  }
  if (err) {
    return <div className="mx-auto max-w-3xl p-4 text-red-300">{err}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      {items.map((item) => (
        <FeedCard
          key={item.id}
          item={item}
          onLike={async () => {
            await load();
          }}
        />
      ))}
    </div>
  );
}

export default function FeedPage() {
  return (
    <AdultGate>
      <FeedInner />
    </AdultGate>
  );
}

