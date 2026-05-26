"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { AdultGate } from "../../../components/AdultGate";
import { apiFetch } from "../../../lib/apiClient";
import { Button, GlassCard } from "@sizeai/ui";

type CreatorPost = {
  id: string;
  text?: string | null;
  visibility: string;
  ppvPriceCents?: number | null;
  likesCount: number;
  likedByViewer: boolean;
  media: Array<{ id: string; mimeType?: string | null; signedGetUrl: string }>;
};

type CreatorResponse = {
  creator: {
    id: string;
    handle?: string | null;
    bio: string | null;
    badgeLevel: string | null;
    subscriptionPriceCents: number;
    payoutEnabled: boolean;
  };
  viewer: { isFollowing: boolean; isSubscribed: boolean };
  posts: CreatorPost[];
};

function CreatorInner() {
  const params = useParams();
  const handle = String(params.handle ?? "");

  const [data, setData] = React.useState<CreatorResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyFollow, setBusyFollow] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<CreatorResponse>(`/creators/${handle}`);
      setData(res);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load creator");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  async function followToggle() {
    if (!data) return;
    setBusyFollow(true);
    try {
      await apiFetch(`/creators/${data.creator.id}/follow`, { method: "POST", body: JSON.stringify({}) });
      await load();
    } finally {
      setBusyFollow(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-3xl p-4 text-white/70">Loading...</div>;
  if (err) return <div className="mx-auto max-w-3xl p-4 text-red-300">{err}</div>;
  if (!data) return <div className="mx-auto max-w-3xl p-4 text-white/70">Not found</div>;

  return (
    <div className="mx-auto max-w-3xl p-4">
      <GlassCard className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/70">@{data.creator.handle}</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Creator profile</h1>
            <p className="mt-2 text-white/70">{data.creator.bio}</p>
            <div className="mt-3 text-sm text-white/60">
              Subscription: ${(data.creator.subscriptionPriceCents / 100).toFixed(2)}/month
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button variant="secondary" onClick={followToggle} disabled={busyFollow}>
              {data.viewer.isFollowing ? "Following" : "Follow"}
            </Button>
            <div className="text-xs text-white/50">{data.viewer.isSubscribed ? "Subscribed" : "Not subscribed"}</div>
          </div>
        </div>
      </GlassCard>

      <div className="mt-4 space-y-4">
        {data.posts.map((p) => (
          <GlassCard key={p.id} className="p-5">
            <div className="text-sm text-white/70">Post</div>
            <div className="mt-1 text-sm text-white/90">{p.text ?? ""}</div>
            {p.media.length ? (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {p.media.map((m) => (
                  <div key={m.id} className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.signedGetUrl} alt="media" className="h-auto w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : null}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

export default function CreatorPage() {
  return (
    <AdultGate>
      <CreatorInner />
    </AdultGate>
  );
}

