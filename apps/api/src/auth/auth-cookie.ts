import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from "./auth.constants.js";

export function buildRefreshCookie(input: {
  readonly expiresAt: string;
  readonly secure: boolean;
  readonly token: string;
}): string {
  const expiresAt = new Date(input.expiresAt);
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000));
  return serializeCookie(input.token, maxAgeSeconds, expiresAt, input.secure);
}

export function buildExpiredRefreshCookie(secure: boolean): string {
  return serializeCookie("", 0, new Date(0), secure);
}

export function readRefreshCookie(cookieHeader: string | undefined): string | undefined {
  if (cookieHeader === undefined) {
    return undefined;
  }

  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = item.slice(0, separator).trim();
    if (name === REFRESH_COOKIE_NAME) {
      const value = item.slice(separator + 1).trim();
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

function serializeCookie(
  value: string,
  maxAgeSeconds: number,
  expiresAt: Date,
  secure: boolean,
): string {
  const parts = [
    `${REFRESH_COOKIE_NAME}=${value}`,
    `Path=${REFRESH_COOKIE_PATH}`,
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${String(maxAgeSeconds)}`,
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}
