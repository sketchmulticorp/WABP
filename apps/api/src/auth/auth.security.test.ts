import assert from "node:assert/strict";
import test from "node:test";

import { AccessTokenService } from "./access-token.service.js";
import { buildExpiredRefreshCookie, buildRefreshCookie, readRefreshCookie } from "./auth-cookie.js";
import type { AuthModuleConfig } from "./auth.types.js";
import { RefreshTokenService } from "./refresh-token.service.js";

const config: AuthModuleConfig = {
  accessSecret: "test-access-secret-that-is-at-least-thirty-two-characters",
  accessTtlSeconds: 900,
  allowedOrigins: ["http://localhost:3000"],
  cookieSecure: true,
  loginEmailLimit: 10,
  loginIpLimit: 100,
  loginWindowSeconds: 900,
  refreshPepper: "test-refresh-pepper-that-is-at-least-thirty-two-characters",
  refreshTtlSeconds: 2_592_000,
  redisKeyPrefix: "test",
};

void test("signs minimal expiring access-token claims and rejects tampering", () => {
  const service = new AccessTokenService(config);
  const signed = service.sign({ sessionId: "session-1", tenantId: "tenant-1", userId: "user-1" });
  const verified = service.verify(signed.token);

  assert.ok(verified);
  assert.equal(verified.sub, "user-1");
  assert.equal(verified.sid, "session-1");
  assert.equal(verified.tid, "tenant-1");
  assert.deepEqual(Object.keys(verified).toSorted(), [
    "aud",
    "exp",
    "iat",
    "iss",
    "sid",
    "sub",
    "tid",
  ]);
  assert.equal(service.verify(`${signed.token.slice(0, -1)}x`), undefined);
});

void test("generates opaque refresh tokens and stores only deterministic peppered digests", () => {
  const service = new RefreshTokenService(config);
  const token = service.generate();
  const digest = service.digest(token);

  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(digest, token);
  assert.equal(service.digest(token), digest);
  assert.notEqual(service.digest(`${token}x`), digest);
});

void test("scopes refresh cookies to auth and applies browser security attributes", () => {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const cookie = buildRefreshCookie({ expiresAt, secure: true, token: "opaque-token" });

  assert.match(cookie, /^whatsapp_refresh=opaque-token;/u);
  assert.match(cookie, /Path=\/api\/v1\/auth/u);
  assert.match(cookie, /HttpOnly/u);
  assert.match(cookie, /SameSite=Strict/u);
  assert.match(cookie, /Secure/u);
  assert.equal(readRefreshCookie(`other=value; ${cookie}`), "opaque-token");
  assert.match(buildExpiredRefreshCookie(true), /Max-Age=0/u);
});
