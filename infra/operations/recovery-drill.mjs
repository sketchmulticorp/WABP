import { runDisposableRecovery } from "./disposable-recovery.service.mjs";

try {
  process.stdout.write(`${JSON.stringify(await runDisposableRecovery())}\n`);
} catch {
  process.stderr.write(
    "Synthetic recovery drill failed; no production restore was attempted. Inspect local Docker/PostgreSQL and rerun.\n",
  );
  process.exitCode = 1;
}
