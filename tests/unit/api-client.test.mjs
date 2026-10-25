import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const success = (data) => Response.json({ data });
const denied = () =>
  Response.json({ error: { code: "AUTH_REQUIRED", message: "Sign in" } }, { status: 401 });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test("CSV and JSON requests share refresh rotation and preserve the binary response", async (t) => {
  let refreshes = 0;
  const api = await client(t, async (url, init) => {
    if (url.endsWith("/auth/refresh")) return success({ access_token: `token-${++refreshes}` });
    if (url.endsWith("/me")) return success({ id: "owner" });
    if (new Headers(init.headers).get("authorization") === "Bearer token-1") return denied();
    if (url.endsWith("/csv"))
      return new Response('\uFEFF"safe"\r\n', {
        headers: { "content-type": "text/csv; charset=utf-8" },
      });
    return success({ ok: true });
  });
  await api.restoreSession();
  const [blob, json] = await Promise.all([
    api.requestCsv("/csv", { method: "POST" }),
    api.request("/private"),
  ]);
  assert.equal(refreshes, 2);
  assert.deepEqual(json, { ok: true });
  assert.equal(await blob.text(), '"safe"\r\n');
});
test("CSV refuses wrong content type and preserves standard JSON authorization errors", async (t) => {
  const api = await client(t, async (url) => {
    if (url.endsWith("/auth/refresh")) return success({ access_token: "current" });
    if (url.endsWith("/me")) return success({ id: "owner" });
    if (url.endsWith("/denied"))
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Not allowed" } },
        { status: 403 },
      );
    return success({ not: "csv" });
  });
  await api.restoreSession();
  await assert.rejects(api.requestCsv("/wrong", {}), { code: "INVALID_EXPORT_RESPONSE" });
  await assert.rejects(api.requestCsv("/denied", {}), { code: "FORBIDDEN" });
});
test("a CSV body finishing after logout is rejected before a stale download can occur", async (t) => {
  const hold = deferred(),
    entered = deferred();
  const api = await client(t, async (url) => {
    if (url.endsWith("/auth/refresh")) return success({ access_token: "current" });
    if (url.endsWith("/me")) return success({ id: "owner" });
    if (url.endsWith("/auth/logout")) return success({ logged_out: true });
    const response = new Response("csv", { headers: { "content-type": "text/csv" } });
    response.blob = async () => {
      entered.resolve();
      await hold.promise;
      return new Blob(["private csv"]);
    };
    return response;
  });
  await api.restoreSession();
  const pending = assert.rejects(api.requestCsv("/csv", {}), { code: "AUTH_REQUIRED" });
  await entered.promise;
  await api.logout();
  hold.resolve();
  await pending;
});

/** Each test gets fresh module state; only the fetch boundary is doubled, not client logic. */
async function client(t, fetch) {
  t.mock.method(globalThis, "fetch", fetch);
  const source = await readFile(
    new URL("../../apps/web/features/workspace/api-client.ts", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // Existing TypeScript compiler handles parameter properties; no new runner or production export.
  return import(
    `data:text/javascript;base64,${Buffer.from(`${compiled}\n// ${crypto.randomUUID()}`).toString("base64")}`
  );
}

test("all HeadersInit forms retain caller headers while authorization and credentials are controlled", async (t) => {
  const seen = [];
  const api = await client(t, async (url, init) => {
    if (url.endsWith("/auth/refresh")) return success({ access_token: "current" });
    if (url.endsWith("/me")) return success({ id: "owner" });
    seen.push(init);
    return success({ ok: true });
  });
  await api.restoreSession();
  for (const headers of [
    { "x-custom": "value" },
    [["x-custom", "value"]],
    new Headers({ "x-custom": "value" }),
  ]) {
    await api.request("/resource", { headers });
  }
  assert.equal(seen.length, 3);
  for (const init of seen) {
    assert.equal(init.headers.get("x-custom"), "value");
    assert.equal(init.headers.get("authorization"), "Bearer current");
    assert.equal(init.credentials, "include");
  }
});

test("delayed old-token rejection reuses newer token without rotating twice", async (t) => {
  const late = deferred(),
    started = deferred();
  let rotations = 0;
  const api = await client(t, async (url, init) => {
    if (url.endsWith("/auth/refresh")) return success({ access_token: `token-${++rotations}` });
    if (url.endsWith("/me")) return success({ id: "owner" });
    if (url.endsWith("/slow") && init.headers.get("authorization") === "Bearer token-1") {
      started.resolve();
      return late.promise;
    }
    return init.headers.get("authorization") === "Bearer token-1"
      ? denied()
      : success({ ok: true });
  });
  await api.restoreSession();
  const slow = api.request("/slow");
  await started.promise;
  await api.request("/fast");
  late.resolve(denied());
  assert.deepEqual(await slow, { ok: true });
  assert.equal(rotations, 2);
});

test("failed rotation clears access and a later explicit restoration can recover", async (t) => {
  let rotations = 0;
  const api = await client(t, async (url) => {
    if (url.endsWith("/auth/refresh"))
      return ++rotations === 2 ? denied() : success({ access_token: "token" });
    return url.endsWith("/me") ? success({ id: "owner" }) : denied();
  });
  await api.restoreSession();
  await assert.rejects(api.request("/private"), { code: "AUTH_REQUIRED" });
  await assert.rejects(api.request("/private"), { code: "AUTH_REQUIRED" });
  assert.equal(rotations, 2);
  assert.deepEqual(await api.restoreSession(), { id: "owner" });
  assert.equal(rotations, 3);
});

test("logout rejects late protected payloads from the previous generation", async (t) => {
  const late = deferred(),
    started = deferred();
  const api = await client(t, async (url) => {
    if (url.endsWith("/auth/refresh")) return success({ access_token: "token" });
    if (url.endsWith("/me")) return success({ id: "owner" });
    if (url.endsWith("/auth/logout")) return success({ logged_out: true });
    started.resolve();
    return late.promise;
  });
  await api.restoreSession();
  const pending = api.request("/private");
  const rejected = assert.rejects(pending, { code: "AUTH_REQUIRED" });
  await started.promise;
  await api.logout();
  late.resolve(success({ private: "must not escape" }));
  await rejected;
  await assert.rejects(api.request("/private"), { code: "AUTH_REQUIRED" });
});

test("logout waits for rotation but rejects its stale token update", async (t) => {
  const rotation = deferred(),
    started = deferred();
  let rotations = 0,
    logouts = 0;
  const api = await client(t, async (url) => {
    if (url.endsWith("/auth/refresh")) {
      if (++rotations === 1) return success({ access_token: "initial" });
      started.resolve();
      return rotation.promise;
    }
    if (url.endsWith("/me")) return success({ id: "owner" });
    if (url.endsWith("/auth/logout")) {
      logouts++;
      return success({ logged_out: true });
    }
    return denied();
  });
  await api.restoreSession();
  const rejected = assert.rejects(api.request("/private"), { code: "AUTH_REQUIRED" });
  await started.promise;
  const logout = api.logout();
  assert.equal(logouts, 0);
  rotation.resolve(success({ access_token: "stale" }));
  await Promise.all([rejected, logout]);
  assert.equal(logouts, 1);
  await assert.rejects(api.request("/private"), { code: "AUTH_REQUIRED" });
});

test("request forwards cancellation to fetch without retrying an aborted read", async (t) => {
  let calls = 0;
  const api = await client(t, async (url, init) => {
    if (url.endsWith("/auth/refresh")) return success({ access_token: "token" });
    if (url.endsWith("/me")) return success({ id: "owner" });
    calls++;
    init.signal.throwIfAborted();
    return success({ ok: true });
  });
  await api.restoreSession();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.request("/private", { signal: controller.signal }), {
    name: "AbortError",
  });
  assert.equal(calls, 1);
});

test("a new login rejects earlier-session protected responses", async (t) => {
  const late = deferred(),
    started = deferred();
  const api = await client(t, async (url) => {
    if (url.endsWith("/auth/refresh")) return success({ access_token: "old-token" });
    if (url.endsWith("/auth/login")) return success({ access_token: "new-token" });
    if (url.endsWith("/me")) return success({ id: "current-owner" });
    started.resolve();
    return late.promise;
  });
  await api.restoreSession();
  const rejected = assert.rejects(api.request("/private"), { code: "AUTH_REQUIRED" });
  await started.promise;
  assert.deepEqual(await api.login("fixture@example.test", "test-only"), { id: "current-owner" });
  late.resolve(success({ old: "private payload" }));
  await rejected;
});
