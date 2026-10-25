import "reflect-metadata";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { Body, Controller, Module, Post, Req, type RawBodyRequest } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Request } from "express";
import { configureAutomationBodyParser } from "./automation-http.config.js";

// Isolated transport harness: no database, credential resolver, queue or provider is constructed.
@Controller("api/v1")
class ParserController {
  @Post("automations")
  automation(@Body() body: { text: string }) {
    return { size: body.text.length };
  }

  @Post("ordinary")
  ordinary() {
    return { ok: true };
  }

  @Post("webhooks/meta")
  webhook(@Req() request: RawBodyRequest<Request>) {
    assert.ok(request.rawBody);
    return {
      digest: createHmac("sha256", "local-test-secret").update(request.rawBody).digest("hex"),
    };
  }
}
@Module({ controllers: [ParserController] })
class ParserModule {
  configureTransport(app: NestExpressApplication) {
    configureAutomationBodyParser(app);
  }
}

void test("automation parser is scoped; Nest raw webhook bytes and ordinary defaults remain intact", async () => {
  const app = await NestFactory.create<NestExpressApplication>(ParserModule, {
    rawBody: true,
    logger: false,
  });
  new ParserModule().configureTransport(app);
  try {
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const send = (path: string, body: string) =>
      fetch(`${base}/api/v1/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    const medium = JSON.stringify({ text: "x".repeat(120_000) });
    const accepted = await send("automations", medium);
    assert.equal(accepted.status, 201);
    assert.deepEqual(await accepted.json(), { size: 120_000 });
    assert.equal((await send("ordinary", medium)).status, 413);
    assert.equal(
      (await send("automations", JSON.stringify({ text: "x".repeat(2_100_000) }))).status,
      413,
    );
    const raw = '{  "text": "Unicode ✓",\n "nested": { "a": 1 } }';
    const webhook = await send("webhooks/meta", raw);
    assert.equal(webhook.status, 201);
    assert.deepEqual(await webhook.json(), {
      digest: createHmac("sha256", "local-test-secret").update(raw).digest("hex"),
    });
  } finally {
    await app.close();
  }
});
