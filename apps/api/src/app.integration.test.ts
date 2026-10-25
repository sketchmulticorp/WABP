import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

const API_STARTUP_ATTEMPTS = 150;

void test("provides request correlation, health checks, envelopes, and redacted JSON logs", async () => {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${String(port)}`;
  const application = startApplication(port);
  let standardOutput = "";
  let standardError = "";

  application.stdout?.setEncoding("utf8");
  application.stdout?.on("data", (chunk: string) => {
    standardOutput += chunk;
  });
  application.stderr?.setEncoding("utf8");
  application.stderr?.on("data", (chunk: string) => {
    standardError += chunk;
  });

  try {
    await waitUntilReady(port, application, () => standardError);

    const approvedRequestId = "approved-request-123";
    const livenessResponse = await fetch(`${baseUrl}/health/live`, {
      headers: { "x-request-id": approvedRequestId },
    });
    const livenessBody = requireRecord(await livenessResponse.json());
    const livenessData = requireRecord(livenessBody.data);

    assert.equal(livenessResponse.status, 200);
    assert.equal(livenessResponse.headers.get("x-request-id"), approvedRequestId);
    assert.equal(livenessBody.request_id, approvedRequestId);
    assert.equal(livenessData.status, "ok");

    const readinessResponse = await fetch(`${baseUrl}/health/ready`);
    const readinessBody = requireRecord(await readinessResponse.json());
    const readinessData = requireRecord(readinessBody.data);
    const readinessChecks = requireRecord(readinessData.checks);

    assert.equal(readinessResponse.status, 200);
    assert.equal(readinessData.status, "ready");
    assert.equal(readinessChecks.configuration, "up");
    assert.equal(readinessChecks.database, "up");
    assert.equal(readinessChecks.redis, "up");

    const rejectedOriginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      body: JSON.stringify({ email: "unknown@example.test", password: "secret" }),
      headers: { "content-type": "application/json", origin: "https://untrusted.example" },
      method: "POST",
    });
    const rejectedOriginBody = requireRecord(await rejectedOriginResponse.json());
    const rejectedOriginError = requireRecord(rejectedOriginBody.error);
    assert.equal(rejectedOriginResponse.status, 403);
    assert.equal(rejectedOriginError.code, "FORBIDDEN");

    const missingSessionResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      headers: { origin: "http://localhost:3000" },
      method: "POST",
    });
    const missingSessionBody = requireRecord(await missingSessionResponse.json());
    const missingSessionError = requireRecord(missingSessionBody.error);
    assert.equal(missingSessionResponse.status, 401);
    assert.equal(missingSessionError.code, "INVALID_SESSION");

    const unauthenticatedMeResponse = await fetch(`${baseUrl}/api/v1/me`);
    const unauthenticatedMeBody = requireRecord(await unauthenticatedMeResponse.json());
    const unauthenticatedMeError = requireRecord(unauthenticatedMeBody.error);
    assert.equal(unauthenticatedMeResponse.status, 401);
    assert.equal(unauthenticatedMeError.code, "UNAUTHENTICATED");

    const conversationId = "00000000-0000-4000-8000-000000000001";
    for (const [method, path] of [
      ["GET", "/conversations"],
      ["GET", "/conversations/assignees"],
      ["GET", `/conversations/${conversationId}`],
      ["GET", `/conversations/${conversationId}/notes`],
      ...["read", "unread", "close", "reopen", "assign", "notes", "messages"].map(
        (action): readonly [string, string] => [
          "POST",
          `/conversations/${conversationId}/${action}`,
        ],
      ),
    ] as const) {
      const response = await fetch(`${baseUrl}/api/v1${path}`, { method });
      assert.equal(
        response.status,
        401,
        `${method} ${path} must authenticate before content access`,
      );
      assert.equal(
        requireRecord(requireRecord(await response.json()).error).code,
        "UNAUTHENTICATED",
      );
    }

    const sensitiveAuthorization = "Bearer must-not-appear-in-logs";
    const sensitiveQuery = "must-not-log-query-secret";
    const rootResponse = await fetch(`${baseUrl}/api/v1?token=${sensitiveQuery}`, {
      headers: { authorization: sensitiveAuthorization },
    });
    const rootBody = requireRecord(await rootResponse.json());

    assert.equal(rootResponse.status, 200);
    assert.equal(typeof rootBody.request_id, "string");
    assert.ok(isRecord(rootBody.data));

    const notFoundResponse = await fetch(`${baseUrl}/api/v1/missing`, {
      headers: { "x-request-id": "not valid because spaces" },
    });
    const notFoundBody = requireRecord(await notFoundResponse.json());
    const errorBody = requireRecord(notFoundBody.error);
    const generatedRequestId = notFoundResponse.headers.get("x-request-id");

    assert.equal(notFoundResponse.status, 404);
    assert.match(generatedRequestId ?? "", /^[0-9a-f-]{36}$/u);
    assert.equal(errorBody.code, "RESOURCE_NOT_FOUND");
    assert.equal(errorBody.request_id, generatedRequestId);
    assert.equal(errorBody.retryable, false);
    assert.deepEqual(errorBody.details, []);
    assert.equal("stack" in errorBody, false);

    const webhookChallengeResponse = await fetch(
      `${baseUrl}/api/v1/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=test-webhook-verify-token&hub.challenge=meta-challenge`,
    );
    assert.equal(webhookChallengeResponse.status, 200);
    assert.equal(await webhookChallengeResponse.text(), "meta-challenge");

    const invalidWebhookResponse = await fetch(`${baseUrl}/api/v1/webhooks/meta/whatsapp`, {
      body: JSON.stringify({ object: "whatsapp_business_account" }),
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256":
          "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      },
      method: "POST",
    });
    const invalidWebhookBody = requireRecord(await invalidWebhookResponse.json());
    assert.equal(invalidWebhookResponse.status, 403);
    assert.equal(requireRecord(invalidWebhookBody.error).code, "WEBHOOK_VERIFICATION_FAILED");

    await waitForLogFlush();
    assert.match(standardOutput, /"service":"api"/u);
    assert.doesNotMatch(standardOutput, new RegExp(sensitiveAuthorization, "u"));
    assert.doesNotMatch(standardOutput, new RegExp(sensitiveQuery, "u"));
  } finally {
    await stopApplication(application);
  }
});

function startApplication(port: number): ChildProcess {
  if (process.env.APP_SMOKE_DATABASE_URL !== undefined)
    assert.equal(
      process.env.APP_SMOKE_DATABASE_URL,
      "postgresql://password_test:disposable_test_only@127.0.0.1:55439/password_test",
    );
  if (process.env.APP_SMOKE_REDIS_URL !== undefined)
    assert.equal(process.env.APP_SMOKE_REDIS_URL, "redis://127.0.0.1:56439");
  return spawn(process.execPath, [fileURLToPath(new URL("./main.js", import.meta.url))], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.APP_SMOKE_DATABASE_URL ??
        "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas",
      LOG_LEVEL: "info",
      JWT_ACCESS_SECRET: "test-access-secret-that-is-at-least-thirty-two-characters",
      META_APP_SECRET: "test-meta-app-secret",
      META_WEBHOOK_VERIFY_TOKEN: "test-webhook-verify-token",
      NODE_ENV: "test",
      PORT: String(port),
      REDIS_URL: process.env.APP_SMOKE_REDIS_URL ?? "redis://localhost:6379",
      REFRESH_TOKEN_PEPPER: "test-refresh-pepper-that-is-at-least-thirty-two-characters",
      S3_ACCESS_KEY_ID: "local-access-key",
      S3_BUCKET: "whatsapp-saas-local",
      S3_ENDPOINT: "http://localhost:9000",
      S3_FORCE_PATH_STYLE: "true",
      S3_REGION: "us-east-1",
      S3_SECRET_ACCESS_KEY: "local-secret-key",
      SMTP_FROM: "no-reply@whatsapp-saas.local",
      SMTP_HOST: "localhost",
      SMTP_PORT: "1025",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function reservePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;

  server.close();
  await once(server, "close");
  return port;
}

async function waitUntilReady(
  port: number,
  application: ChildProcess,
  readStandardError: () => string,
): Promise<void> {
  const livenessUrl = `http://127.0.0.1:${String(port)}/health/live`;

  // Windows dependency loading can exceed five seconds on a cold filesystem cache.
  for (let attempt = 0; attempt < API_STARTUP_ATTEMPTS; attempt += 1) {
    if (application.exitCode !== null) {
      throw new Error(
        `API exited before becoming ready (code ${String(application.exitCode)}): ${readStandardError()}`,
      );
    }

    try {
      const response = await fetch(livenessUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // The process is still starting; the bounded retry loop will fail with context if needed.
    }

    await delay(100);
  }

  throw new Error(`API did not become ready: ${readStandardError()}`);
}

async function stopApplication(application: ChildProcess): Promise<void> {
  if (application.exitCode !== null) {
    return;
  }

  application.kill();
  await once(application, "exit");
}

async function waitForLogFlush(): Promise<void> {
  await delay(100);
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function requireRecord(value: unknown): Record<string, unknown> {
  assert.ok(isRecord(value));
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
