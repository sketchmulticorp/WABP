import assert from "node:assert/strict";
import { test } from "node:test";
import { localRecoveryUrl } from "../../infra/operations/disposable-recovery.service.mjs";
import { DisposableRecoveryRepository } from "../../infra/operations/disposable-recovery.repository.mjs";

test("recovery tool refuses remote/production database settings without connecting", () => {
  for (const environment of [
    { NODE_ENV: "production" },
    { DATABASE_URL: "postgres://test:test@db.example.invalid/customer" },
    { DATABASE_URL: "https://localhost/db" },
  ])
    assert.throws(() => localRecoveryUrl(environment));
  assert.equal(localRecoveryUrl({}).hostname, "localhost");
});
test("recovery identifiers cannot target application databases or inject SQL", () => {
  for (const name of [
    "whatsapp_saas",
    "postgres",
    "phase8_source_bad",
    'phase8_source_";DROP DATABASE postgres;--',
  ])
    assert.throws(() => DisposableRecoveryRepository.prototype.validateName(name));
  assert.doesNotThrow(() =>
    DisposableRecoveryRepository.prototype.validateName(`phase8_restore_${"a".repeat(32)}`),
  );
});
