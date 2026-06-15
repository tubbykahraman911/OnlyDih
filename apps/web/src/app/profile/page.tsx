"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhaseShell, Panel } from "../../components/PhaseShell";
import { apiFetch } from "../../lib/apiClient";
import { isUnauthorized } from "../../lib/authRedirect";

type Profile = {
  username: string;
  verificationStatus: string;
  privateAnalysisCount: number;
  averagePrivateScore: number | null;
  bestPrivateScore: number | null;
  savedPrivateResults: Array<{ id: string; totalScore: number; createdAt: string; upload: { originalFilename: string } }>;
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    void apiFetch<{ profile: Profile }>("/api/profile/private")
      .then((response) => setProfile(response.profile))
      .catch((reason) => {
        if (isUnauthorized(reason)) router.push("/login");
      });
  }, [router]);

  return (
    <PhaseShell>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Panel>
          {!profile ? (
            <p className="text-sm text-[#5f3f16]">Loading profile...</p>
          ) : (
            <>
              <p className="kicker">Private profile</p>
              <h1 className="text-3xl font-semibold">{profile.username}</h1>
              <p className="mt-2 text-sm text-[#5f3f16]">Private profile only. Verification: {profile.verificationStatus}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-[#d6a72f]/25 bg-white/60 p-4"><p className="text-sm text-[#7b6134]">Private analyses</p><p className="text-2xl font-semibold">{profile.privateAnalysisCount}</p></div>
                <div className="rounded-md border border-[#d6a72f]/25 bg-white/60 p-4"><p className="text-sm text-[#7b6134]">Average score</p><p className="text-2xl font-semibold">{profile.averagePrivateScore?.toFixed(1) ?? "N/A"}</p></div>
                <div className="rounded-md border border-[#d6a72f]/25 bg-white/60 p-4"><p className="text-sm text-[#7b6134]">Best score</p><p className="text-2xl font-semibold">{profile.bestPrivateScore?.toFixed(1) ?? "N/A"}</p></div>
              </div>
              <div className="mt-6 space-y-3">
                <h2 className="text-xl font-semibold">Saved private results</h2>
                {profile.savedPrivateResults.length === 0 ? <p className="text-sm text-[#5f3f16]">No saved results yet.</p> : profile.savedPrivateResults.map((result) => (
                  <Link key={result.id} href={`/results/${result.id}`} className="block rounded-md border border-[#d6a72f]/25 bg-white/60 p-4 hover:border-[#b7833a]">
                    <span className="font-medium">{result.totalScore.toFixed(1)} / 100</span>
                    <span className="ml-3 text-sm text-[#7b6134]">{result.upload.originalFilename}</span>
                  </Link>
                ))}
              </div>
              <Link href="/delete-data" className="danger-button mt-6">
                Delete all my data
              </Link>
            </>
          )}
        </Panel>
      </main>
    </PhaseShell>
  );
}
