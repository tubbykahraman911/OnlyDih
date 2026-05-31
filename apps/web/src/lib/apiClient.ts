const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export type ApiClientError = { message: string };

let csrfToken: string | null = null;

function csrfFromCookie() {
  if (typeof document === "undefined") return null;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("od_csrf="))
    ?.slice("od_csrf=".length) ?? null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method?.toUpperCase() ?? "GET";
  const headers = new Headers(init.headers);
  const isJsonBody = init.body && !(init.body instanceof FormData);
  if (isJsonBody && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = csrfToken ?? csrfFromCookie();
    if (token) headers.set("x-csrf-token", token);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    method,
    headers,
    credentials: "include"
  });
  const json = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) throw { message: json?.error?.message ?? "Request failed" } satisfies ApiClientError;
  if (json?.csrfToken) csrfToken = json.csrfToken;
  return json as T;
}

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}
