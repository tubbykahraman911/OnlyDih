"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AdultGate } from "../../../components/AdultGate";
import { apiFetch } from "../../../lib/apiClient";
import { supabase } from "../../../lib/supabaseClient";
import { Button, GlassCard } from "@sizeai/ui";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

type ChatMessage = {
  id: string;
  senderId: string;
  createdAt: string;
  body: string | null;
  ppvUnlockPriceCents: number | null;
  isLocked: boolean;
  attachmentMediaId: string | null;
};

type StripeClientSecret = string;

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

function UnlockPaymentForm({
  clientSecret,
  onSuccess
}: {
  clientSecret: StripeClientSecret;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (!stripe || !elements) throw new Error("Stripe not ready");
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Card element missing");

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card }
      });

      if (result.error) throw result.error;
      if (result.paymentIntent?.status !== "succeeded") {
        throw new Error("Payment not successful");
      }
      onSuccess();
    } catch (e: any) {
      setErr(e?.message ?? "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <CardElement />
      </div>
      {err ? <div className="text-sm text-red-300">{err}</div> : null}
      <Button type="submit" disabled={busy} className="w-full rounded-xl">
        {busy ? "Unlocking..." : "Unlock message"}
      </Button>
    </form>
  );
}

function ChatThreadInner({
  threadId
}: {
  threadId: string;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [mediaUrlById, setMediaUrlById] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const [busySend, setBusySend] = React.useState(false);

  const [unlockingFor, setUnlockingFor] = React.useState<ChatMessage | null>(null);
  const [unlockClientSecret, setUnlockClientSecret] = React.useState<string | null>(null);

  async function loadMessages() {
    const data = await apiFetch<{ items: ChatMessage[] }>(`/chats/${threadId}/messages`);
    setMessages(data.items ?? []);
  }

  async function refreshMediaUrls(nextMessages: ChatMessage[]) {
    const ids = nextMessages
      .filter((m) => m.attachmentMediaId && !mediaUrlById[m.attachmentMediaId])
      .map((m) => m.attachmentMediaId as string);

    if (!ids.length) return;
    const fetched = await Promise.all(
      ids.map(async (id) => {
        const res = await apiFetch<{ signedGetUrl: string }>(`/media/${id}/url`);
        return [id, res.signedGetUrl] as const;
      })
    );
    setMediaUrlById((prev) => ({ ...prev, ...Object.fromEntries(fetched) }));
  }

  React.useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        await loadMessages();
        if (!active) return;
        const latest = await apiFetch<{ items: ChatMessage[] }>(`/chats/${threadId}/messages`);
        await refreshMediaUrls(latest.items ?? []);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load messages");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  React.useEffect(() => {
    // SSE stream for new messages.
    let es: EventSource | null = null;
    let closed = false;
    (async () => {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;
      if (!token) return;

      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
      const url = `${apiBaseUrl}/chats/${threadId}/stream?access_token=${encodeURIComponent(token)}`;
      es = new EventSource(url);

      es.addEventListener("message", async (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.id)) return prev;
            return [...prev, payload];
          });
        } catch {
          // ignore
        }
      });

      es.addEventListener("error", () => {
        if (closed) return;
      });
    })();

    return () => {
      closed = true;
      es?.close();
    };
  }, [threadId]);

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    setBusySend(true);
    try {
      await apiFetch(`/chats/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text })
      });
      setInput("");
    } finally {
      setBusySend(false);
    }
  }

  async function unlock(message: ChatMessage) {
    if (!message.ppvUnlockPriceCents) return;
    setUnlockingFor(message);
    setUnlockClientSecret(null);

    const res = await apiFetch<{ clientSecret: string }>(`/stripe/ppv/create-intent`, {
      method: "POST",
      body: JSON.stringify({
        chatMessageId: message.id,
        amountCents: message.ppvUnlockPriceCents
      })
    });

    setUnlockClientSecret(res.clientSecret);
  }

  async function onUnlockSuccess() {
    setUnlockingFor(null);
    setUnlockClientSecret(null);
    // Poll until webhook updates purchase state and the server unlocks the message.
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const data = await apiFetch<{ items: ChatMessage[] }>(`/chats/${threadId}/messages`);
      setMessages(data.items ?? []);
      await refreshMediaUrls(data.items ?? []);
      if (data.items?.some((m) => !m.isLocked)) break;
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      {loading ? <div className="text-white/70">Loading...</div> : null}
      {err ? <div className="text-red-300">{err}</div> : null}

      <div className="space-y-3">
        {messages.map((m) => (
          <div key={m.id} className="flex">
            <GlassCard className="w-full p-4">
              <div className="text-xs text-white/50">
                {new Date(m.createdAt).toLocaleTimeString()} {m.isLocked ? "(locked)" : ""}
              </div>
              <div className="mt-2 text-sm text-white/90">
                {m.isLocked ? "This message is locked. Unlock to see it." : m.body}
              </div>
              {m.attachmentMediaId && !m.isLocked && mediaUrlById[m.attachmentMediaId] ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrlById[m.attachmentMediaId]}
                    alt="attachment"
                    className="h-auto w-full object-cover"
                  />
                </div>
              ) : null}

              {m.isLocked && m.ppvUnlockPriceCents ? (
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="secondary"
                    className="rounded-xl"
                    onClick={() => void unlock(m)}
                  >
                    Unlock ${(m.ppvUnlockPriceCents / 100).toFixed(2)}
                  </Button>
                </div>
              ) : null}
            </GlassCard>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Write a message..."
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-300/40"
            disabled={busySend}
          />
          <Button onClick={() => void sendMessage()} disabled={busySend} className="rounded-xl">
            Send
          </Button>
        </div>
      </div>

      {unlockingFor && unlockClientSecret ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <GlassCard className="w-full max-w-md p-6">
            <div className="text-sm text-white/70">Unlock PPV message</div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Confirm payment</h2>
            <div className="mt-2 text-sm text-white/70">
              {unlockingFor.ppvUnlockPriceCents
                ? `Cost: $${(unlockingFor.ppvUnlockPriceCents / 100).toFixed(2)}`
                : ""}
            </div>
            <div className="mt-4">
              <Elements stripe={stripePromise}>
                <UnlockPaymentForm
                  clientSecret={unlockClientSecret}
                  onSuccess={() => void onUnlockSuccess()}
                />
              </Elements>
            </div>
            <div className="mt-4 text-right">
              <Button variant="ghost" className="rounded-xl" onClick={() => { setUnlockingFor(null); setUnlockClientSecret(null); }}>
                Cancel
              </Button>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}

export default function ChatThreadPage() {
  const params = useParams();
  const threadId = String(params.threadId ?? "");
  return (
    <AdultGate>
      <ChatThreadInner threadId={threadId} />
    </AdultGate>
  );
}

