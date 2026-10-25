import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { DisposableRecoveryRepository } from "./disposable-recovery.repository.mjs";
import { runPostgresTool } from "./postgres-tools.adapter.mjs";

export function localRecoveryUrl(environment = process.env) {
  const url = new URL(
    environment.DATABASE_URL ??
      "postgresql://whatsapp:whatsapp_local_only@localhost:5432/whatsapp_saas",
  );
  if (
    environment.NODE_ENV === "production" ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("LOCAL_SYNTHETIC_RECOVERY_ONLY");
  return url;
}
/** Creates both databases itself; never accepts a source, restore target, dump path or existing backup. */
export async function runDisposableRecovery(environment = process.env) {
  const url = localRecoveryUrl(environment),
    marker = randomUUID();
  const source = `phase8_source_${marker.replaceAll("-", "")}`,
    target = `phase8_restore_${marker.replaceAll("-", "")}`;
  const repository = new DisposableRecoveryRepository(url),
    owned = [],
    started = Date.now();
  try {
    await repository.create(source);
    owned.push(source);
    await repository.create(target);
    owned.push(target);
    await repository.fixture(source, marker);
    const before = await repository.evidence(source);
    const archive = await runPostgresTool(url, "pg_dump", source);
    assert.equal(archive.subarray(0, 5).toString("ascii"), "PGDMP");
    await runPostgresTool(url, "pg_restore", target, archive);
    const restored = await repository.evidence(target);
    assert.deepEqual(restored, before);
    assert.equal(restored.appTables, 35);
    assert.equal(restored.tenants, 1);
    assert.ok(restored.migrations > 0);
    assert.equal(await repository.verifyConstraint(target), true);
    return {
      status: "PASS",
      appTables: restored.appTables,
      migrations: restored.migrations,
      syntheticRows: restored.rows.length,
      bytes: archive.length,
      sha256: createHash("sha256").update(archive).digest("hex"),
      elapsedMs: Date.now() - started,
      scope: "Synthetic local PostgreSQL only; not production recovery certification",
    };
  } finally {
    // Only names created successfully by this invocation can be dropped; no force/termination/clean flags.
    try {
      for (const name of owned.reverse()) await repository.drop(name);
    } finally {
      await repository.close();
    }
  }
}
