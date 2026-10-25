import assert from "node:assert/strict";
import test from "node:test";
import { parsePasswordChangeInput } from "./password-change.dto.js";

void test("accepts only the explicit password contract without trimming secrets", () => {
  assert.deepEqual(
    parsePasswordChangeInput({ current_password: " temporary ", new_password: "New!Password123" }),
    { currentPassword: " temporary ", newPassword: "New!Password123" },
  );
});

for (const body of [
  null,
  [],
  "invalid",
  {},
  { current_password: "temporary", new_password: "short" },
  { current_password: "temporary", new_password: "longbutlowercase" },
  { current_password: "temporary", new_password: "New!Password123", role: "SUPER_ADMIN" },
  { current_password: "", new_password: "New!Password123" },
  { current_password: "temporary", new_password: "A1!".repeat(44) },
]) {
  void test("rejects malformed, weak, oversized or overposted password input", () => {
    assert.throws(
      () => parsePasswordChangeInput(body),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("New!Password123"), false);
        return true;
      },
    );
  });
}
