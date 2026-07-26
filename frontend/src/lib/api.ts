/**
 * The API client. Types come from `@shared/types.ts`, which the backend imports too, so a
 * response-shape change that only lands on one side fails `tsc` rather than producing a
 * blank page (petedio lessons, 2026-06-06 — hand-mirrored DTOs drift silently).
 *
 * `Backend` is an interface rather than a set of loose functions so demo.html can supply a
 * fully in-memory implementation and drive the real UI with no server at all.
 */
import type {
  FamilyView,
  Fast,
  LogWaterBody,
  Me,
  PersonalStats,
  StartFastBody,
  WaterEntry,
} from "@shared/types.ts";

export interface Backend {
  me(): Promise<Me>;
  setDisplayName(displayName: string): Promise<Me>;
  startFast(body: StartFastBody): Promise<Fast>;
  endFast(fastId: string): Promise<Fast>;
  logWater(fastId: string, body: LogWaterBody): Promise<WaterEntry>;
  deleteWater(entryId: string): Promise<void>;
  family(): Promise<FamilyView>;
  /** Personal records over finished fasts — the stats page. */
  stats(): Promise<PersonalStats>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
    });
  } catch {
    // Offline, or the tunnel dropped — say so plainly instead of surfacing "fetch failed".
    throw new ApiError("Can't reach the server. Check your connection.", 0);
  }

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    // A Cloudflare Access session that expired mid-use comes back as an HTML login page,
    // not JSON — reloading re-runs the Access redirect and puts the user back on Authentik.
    if (res.status === 401 || res.status === 403) {
      throw new ApiError("Your sign-in expired. Reload the page to sign in again.", res.status);
    }
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new ApiError(message, res.status);
  }

  return (await res.json()) as T;
}

/** The real backend, talking to the Bun service over same-origin `/api`. */
export const httpBackend: Backend = {
  me: () => request<Me>("/api/me"),

  setDisplayName: (displayName) =>
    request<Me>("/api/me", { method: "PATCH", body: JSON.stringify({ displayName }) }),

  startFast: (body) =>
    request<Fast>("/api/fasts", { method: "POST", body: JSON.stringify(body) }),

  endFast: (fastId) =>
    request<Fast>(`/api/fasts/${encodeURIComponent(fastId)}/end`, { method: "POST" }),

  logWater: (fastId, body) =>
    request<WaterEntry>(`/api/fasts/${encodeURIComponent(fastId)}/water`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteWater: (entryId) =>
    request<void>(`/api/water/${encodeURIComponent(entryId)}`, { method: "DELETE" }),

  family: () => request<FamilyView>("/api/family"),

  stats: () => request<PersonalStats>("/api/me/stats"),
};
