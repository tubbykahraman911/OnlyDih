import { supabase } from "./supabaseClient";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!apiBaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_API_BASE_URL");
}

export type ApiClientError = { message: string };

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const sessionRes = await supabase.auth.getSession();
  const accessToken = sessionRes.data.session?.access_token;
  if (!accessToken) throw { message: "Not authenticated" } satisfies ApiClientError;

  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw { message: json?.error?.message ?? "Request failed" } satisfies ApiClientError;
  }
  return json as T;
}

export async function apiFetchPublic<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, init);
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw { message: json?.error?.message ?? "Request failed" } satisfies ApiClientError;
  return json as T;
}

