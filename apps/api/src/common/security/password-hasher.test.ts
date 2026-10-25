import assert from "node:assert/strict";
import test from "node:test";

import { Argon2idPasswordHasher } from "./password-hasher.js";

void test("hashes bootstrap passwords as salted Argon2id PHC strings", async () => {
  const hasher = new Argon2idPasswordHasher();
  const password = "Strong!Bootstrap123";
  const first = await hasher.hash(password);
  const second = await hasher.hash(password);

  assert.match(first, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$[^$]+\$[^$]+$/u);
  assert.notEqual(first, second);
  assert.doesNotMatch(first, new RegExp(password, "u"));
  assert.equal(await hasher.verify(password, first), true);
  assert.equal(await hasher.verify("Incorrect!Password123", first), false);
  assert.equal(await hasher.verify(password, undefined), false);
  assert.equal(await hasher.verify(password, "invalid-hash"), false);
});
