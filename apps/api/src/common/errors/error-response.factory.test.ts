import assert from "node:assert/strict";
import test from "node:test";
import { mapExceptionToApiError } from "./error-response.factory.js";

void test("known Express body-size errors map to safe 413 without copying parser metadata", () => {
  const error = Object.assign(new Error("private body diagnostic"), {
    type: "entity.too.large",
    status: 413,
    body: "private payload",
    limit: 100,
  });
  const result = mapExceptionToApiError(error, "request-test");
  assert.equal(result.statusCode, 413);
  assert.deepEqual(result.envelope.error, {
    code: "PAYLOAD_TOO_LARGE",
    message: "The request payload is too large.",
    request_id: "request-test",
    details: [],
    retryable: false,
  });
  assert.doesNotMatch(JSON.stringify(result), /private|diagnostic/u);
});
void test("arbitrary error status fields and unrecognized types cannot override internal error handling", () => {
  for (const error of [
    Object.assign(new Error("private"), { status: 413 }),
    Object.assign(new Error("private"), { status: 401, type: "entity.too.large" }),
    { status: 413, type: "entity.too.large" },
  ]) {
    const result = mapExceptionToApiError(error, "request-test");
    assert.equal(result.statusCode, 500);
    assert.equal(result.envelope.error.code, "INTERNAL_ERROR");
  }
});
