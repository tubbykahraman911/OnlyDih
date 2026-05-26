"use client";

import * as React from "react";
import { AdultGate } from "../../components/AdultGate";
import { apiFetch } from "../../lib/apiClient";
import { Button, GlassCard } from "@sizeai/ui";

type MeResponse = { role: "FAN" | "CREATOR" | "ADMIN"; id: string };

type PendingMedia = {
  id: string;
  ownerId: string;
  postId: string | null;
  mimeType: string | null;
  createdAt: string;
  moderationStatus: string;
  csamCheckStatus: string;
};

type OpenReport = {
  id: string;
  reason: string;
  status: string;
  createdAt: string;
  reporter: { id: string; handle: string | null };
};

export default function AdminPage() {
  return (
    <AdultGate>
      <AdminInner />
    </AdultGate>
  );
}

function AdminInner() {
  const [me, setMe] = React.useState<MeResponse | null>(null);
  const [queue, setQueue] = React.useState<{ pendingMedia: PendingMedia[]; openReports: OpenReport[] } | null>(null);
  const [analytics, setAnalytics] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setErr(null);
    try {
      const meRes = await apiFetch<MeResponse>("/me");
      setMe(meRes);

      const q = await apiFetch<{ pendingMedia: PendingMedia[]; openReports: OpenReport[] }>(
        "/admin/moderation/queue"
      );
      setQueue(q);

      const a = await apiFetch("/admin/analytics");
      setAnalytics(a);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void loadAll();
  }, []);

  async function moderate(mediaId: string, action: "approve" | "reject" | "flag") {
    await apiFetch(`/admin/media/${mediaId}/moderate`, {
      method: "POST",
      body: JSON.stringify({ action })
    });
    await loadAll();
  }

  if (loading) return <div className="mx-auto max-w-4xl p-4 text-white/70">Loading...</div>;
  if (err) return <div className="mx-auto max-w-4xl p-4 text-red-300">{err}</div>;
  if (!me) return <div className="mx-auto max-w-4xl p-4 text-white/70">Not loaded</div>;
  if (me.role !== "ADMIN") return <div className="mx-auto max-w-4xl p-4 text-red-300">Forbidden</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-white/70">Admin</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Moderation dashboard</h1>
        </div>
        {analytics ? (
          <GlassCard className="p-4 min-w-[220px]">
            <div className="text-sm text-white/70">Analytics (MVP)</div>
            <div className="mt-2 text-sm text-white/90">Users: {analytics.userCount}</div>
            <div className="mt-1 text-sm text-white/90">Pending media: {analytics.mediaPendingCount}</div>
            <div className="mt-1 text-sm text-white/90">Open reports: {analytics.openReportCount}</div>
          </GlassCard>
        ) : null}
      </div>

      <GlassCard className="p-5">
        <div className="text-sm text-white/70">Pending media</div>
        <div className="mt-3 space-y-3">
          {(queue?.pendingMedia ?? []).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="min-w-0">
                <div className="text-sm text-white/90 truncate">{m.id}</div>
                <div className="text-xs text-white/60 mt-1">
                  owner {m.ownerId} • status {m.moderationStatus} • CSAM {m.csamCheckStatus}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void moderate(m.id, "approve")} className="rounded-xl">
                  Approve
                </Button>
                <Button variant="ghost" onClick={() => void moderate(m.id, "reject")} className="rounded-xl">
                  Reject
                </Button>
              </div>
            </div>
          ))}
          {!(queue?.pendingMedia ?? []).length ? <div className="text-white/70">No pending items.</div> : null}
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="text-sm text-white/70">Open reports</div>
        <div className="mt-3 space-y-3">
          {(queue?.openReports ?? []).map((r) => (
            <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-white/90">Reporter: @{r.reporter.handle ?? "unknown"}</div>
              <div className="mt-2 text-sm text-white/70">{r.reason}</div>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="secondary"
                  className="rounded-xl"
                  onClick={() =>
                    void apiFetch(`/admin/reports/${r.id}/resolve`, { method: "POST", body: JSON.stringify({ resolve: true }) }).then(loadAll)
                  }
                >
                  Resolve
                </Button>
              </div>
            </div>
          ))}
          {!(queue?.openReports ?? []).length ? <div className="text-white/70">No open reports.</div> : null}
        </div>
      </GlassCard>
    </div>
  );
}

