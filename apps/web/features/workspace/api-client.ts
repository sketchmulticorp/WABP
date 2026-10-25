"use client";

import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  AuthTokenResponse,
  CurrentUserResponse,
} from "@whatsapp-platform/contracts";

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(
  /\/$/u,
  "",
);

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<void> | null = null;
let sessionGeneration = 0;

export async function restoreSession(): Promise<CurrentUserResponse> {
  await refreshAccessToken();
  return request<CurrentUserResponse>("/me");
}

export async function login(email: string, password: string): Promise<CurrentUserResponse> {
  const generation = ++sessionGeneration;
  accessToken = null;
  // Finish any prior cookie rotation before starting a new login session.
  await refreshInFlight?.catch(() => undefined);
  const token = await unauthenticatedRequest<AuthTokenResponse>("/auth/login", {
    body: JSON.stringify({ email, password }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assertSessionGeneration(generation);
  accessToken = token.access_token;
  return request<CurrentUserResponse>("/me");
}

export async function logout(): Promise<void> {
  const generation = ++sessionGeneration;
  accessToken = null;
  try {
    await refreshInFlight?.catch(() => undefined);
    // Logout is cookie-authenticated; do not trigger another access-token rotation here.
    await unauthenticatedRequest("/auth/logout", { method: "POST" });
  } finally {
    if (generation === sessionGeneration) accessToken = null;
  }
}

/** All sessions are revoked server-side; discard the token, never silently sign in again. */
export async function changeInitialPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  return submitPasswordChange("/auth/change-initial-password", currentPassword, newPassword);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return submitPasswordChange("/auth/change-password", currentPassword, newPassword);
}

async function submitPasswordChange(
  path: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await request<{ password_changed: true; login_required: true }>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  ++sessionGeneration;
  accessToken = null;
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<T> {
  return authorizedRequest(path, init, readEnvelope<T>, retried);
}

/** Binary downloads share refresh coalescing and stale-session rejection with JSON requests. */
export async function requestCsv(path: string, init: RequestInit): Promise<Blob> {
  return authorizedRequest(path, init, async (response) => {
    if (!response.ok) return readEnvelope<never>(response);
    if (!response.headers.get("content-type")?.startsWith("text/csv"))
      throw new ApiClientError(
        "INVALID_EXPORT_RESPONSE",
        "The export response was not CSV.",
        response.status,
      );
    return response.blob();
  });
}

async function authorizedRequest<T>(
  path: string,
  init: RequestInit,
  readResponse: (response: Response) => Promise<T>,
  retried = false,
): Promise<T> {
  if (accessToken === null)
    throw new ApiClientError("AUTH_REQUIRED", "Please sign in to continue.", 401);
  const generation = sessionGeneration;
  const sentToken = accessToken;
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${sentToken}`);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  assertSessionGeneration(generation);
  if (response.status === 401 && !retried) {
    // A delayed 401 for an older token must reuse the already-rotated token.
    if (accessToken === sentToken) await refreshAccessToken();
    assertSessionGeneration(generation);
    return authorizedRequest(path, init, readResponse, true);
  }
  const payload = await readResponse(response);
  assertSessionGeneration(generation);
  return payload;
}

async function refreshAccessToken(): Promise<void> {
  if (refreshInFlight !== null) return refreshInFlight;
  const generation = sessionGeneration;
  refreshInFlight = (async () => {
    try {
      const token = await unauthenticatedRequest<AuthTokenResponse>("/auth/refresh", {
        method: "POST",
      });
      assertSessionGeneration(generation);
      accessToken = token.access_token;
    } catch (error) {
      if (generation === sessionGeneration) accessToken = null;
      throw error;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

function assertSessionGeneration(generation: number): void {
  if (generation !== sessionGeneration)
    throw new ApiClientError(
      "AUTH_REQUIRED",
      "The active session changed. Please sign in again.",
      401,
    );
}

async function unauthenticatedRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: "include" });
  return readEnvelope<T>(response);
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    ApiErrorEnvelope | ApiSuccessEnvelope<T> | null;
  if (!response.ok || payload === null || !("data" in payload)) {
    const error = payload !== null && "error" in payload ? payload.error : undefined;
    throw new ApiClientError(
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "The request could not be completed.",
      response.status,
    );
  }
  return payload.data;
}
