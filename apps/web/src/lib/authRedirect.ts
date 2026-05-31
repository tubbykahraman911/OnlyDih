import type { ApiClientError } from "./apiClient";

export function isUnauthorized(reason: unknown) {
  return Boolean(reason && typeof reason === "object" && (reason as ApiClientError).message === "Unauthorized");
}
