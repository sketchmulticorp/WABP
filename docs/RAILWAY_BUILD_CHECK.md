# Railway local build checkpoint — 2026-10-18

Owner approved local Docker build verification only, within the no-paid-upgrade boundary.

## Completed evidence

All three root-context builds completed production packaging and image export with exit0:

| Image tag | Dockerfile | Dependency build tasks |
| --- | --- | --- |
| whatsapp-buildcheck-web:20261018 | infra/railway/Dockerfile.web | 2/2 |
| whatsapp-buildcheck-api:20261018 | infra/railway/Dockerfile.api | 7/7 |
| whatsapp-buildcheck-worker:20261018 | infra/railway/Dockerfile.worker | 8/8 |

The original Railway missing-workspace-module errors did not occur. Shared packages were
compiled before their consumers. Frozen install and supply-chain checks passed. Slow registry
requests retried successfully. Legacy-deploy/deprecation warnings remain, not a security pass.
No application code or dependency versions changed to achieve these builds.

Web used `NEXT_PUBLIC_API_URL=https://api.build-check.invalid/api/v1`. This non-secret placeholder
is embedded in its bundle: the local verification image is not a working live deployment.
Each build used repository root context and `--file infra/railway/Dockerfile.<service>`.
Base resolved to Node24 bookworm-slim digest
`sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5`.

Before the interruption, image metadata inspection confirmed API/Worker run as non-root node,
work in /app/apps/api or /app/apps/worker, with commands node dist/main.js and node
dist/consumer.js respectively. Final Web metadata inspection did not execute because approval
review was temporarily unavailable. On the owner-requested retry, Docker Desktop's Linux
engine was stopped/unavailable; metadata recheck remains pending. Successful prior build logs
are preserved as evidence and are not invalidated by the stopped engine.

## Boundaries and next steps

No application containers, functional tests, migrations, seeds, provider calls, cloud
provisioning or deployment changes ran. Local tags/cache were retained. No Railway credit
was used by these local builds. Existing vulnerability findings remain unresolved; no rescan
was performed. Current local dirty working tree was built, not a verified exact GitHub commit.

Railway15 changes remain staged, not applied. Missing backend configuration/infrastructure,
trial5-service layout and same-site browser authentication still require resolution.
Owner started Docker Desktop; final metadata inspection succeeded for all three images.
Web runs as node in /app/apps/web with command
`node node_modules/next/dist/bin/next start --hostname 0.0.0.0`.
API/Worker metadata again matched the entry points recorded above. This closes the local
build-only checkpoint, not live/runtime readiness. No application container was started.
