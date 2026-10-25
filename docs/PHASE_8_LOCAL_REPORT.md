# Phase 8 local checkpoint — 2026-10-17

Status: local checkpoint complete with unresolved security findings; not launch approval. CLAR-043–045 authorize
local synthetic fixtures, tests, recovery tooling and lean image builds/scans only.

## Executed evidence

| Check | Observed result |
| --- | --- |
| Reporting/export unit tests | 12 passed |
| Disposable PostgreSQL reporting tests | 6 passed |
| Authenticated HTTP reporting/export | Passed; combined SQL/HTTP rerun 7/7 |
| Worker health/scheduler lifecycle | 5 passed |
| Shared JSON/CSV client | 10 passed |
| Reporting Playwright flows | 4 passed |
| Recovery target safety guards | 2 passed |
| Full `pnpm check` | Passed: schema, formatting, lint, typecheck, registered unit suites, build and all 33 browser tests |
| Disposable dump/restore drill | Passed: 35 app tables, 9 migrations, 2 synthetic marker rows, primary-key constraint verified |

The recovery archive was 145,468 bytes and held only this invocation's generated fixtures.
Both generated databases were removed. See `OPERATIONS_RUNBOOK.md` for boundaries and use.
No existing application database was restored over or used as the dump source.

SQL tests caught a real duplicate-payment mapping defect: Drizzle wraps PostgreSQL `23505`
in `Error.cause`. The existing conflict mapper now follows a bounded cause chain, preserving
the intended conflict without returning database details. Duplicate-reference retest passed;
TASK-084.2.1 later completed the missing focused permutations: concurrent same-reference writes
persist exactly one payment and one matching audit while the loser maps to 409, and a forced audit
failure rolls back its payment. The scoped SQL file passed 8/8 on 2026-10-25. Its first combined
run also passed all eight SQL cases, while the separate authenticated HTTP fixture hit the known
startup timeout (`HTTP null; markers empty`); that unrelated fixture was not changed here.

Initial combined HTTP/SQL execution hit API startup timeout during concurrent heavy image
builds; isolated authenticated HTTP passed. A browser assertion initially matched Next's
route announcer as well as the error; scoping the assertion to the feature region fixed
the test. Neither fixture correction changes application behavior.

## Security / packaging

Original full-workspace API/worker/web Linux images built. The initial API Trivy report
contained 7 critical and 117 high package occurrences, including unnecessary development
tooling and Debian packages. These counts are occurrences, not unique CVEs. Production
dependency audit passed its high threshold with one moderate; all-dependency audit failed
on the high `braces` toolchain advisory (GHSA-vfj7-8cjw-p6xm). No finding was suppressed.

Owner approved production-only pnpm deployment artifacts and available security updates
within Node 24/bookworm. All three lean Linux images built and passed non-root artifact checks;
API migrations and worker shared-runtime imports work; development CLI/TypeScript and source
directories are absent. Web production HTTP smoke passed with injected PORT, network isolated.
API/worker/web rescans each report 1 critical / 60 high package occurrences and exit 1.
Three fixable occurrences are in base-image bundled npm (brace-expansion twice and undici),
not app dependencies. The critical zlib1g CVE-2023-45853 is marked will_not_fix by the scanner;
OS findings need applicability/security review, not automatic acceptance or suppression.
No baseline change or app dependency upgrade was made. All three JSON reports are retained
under ignored `.local/phase8/reports/*-lean.json`; no finding is accepted merely by recording it.

Verified image manifest identities:

- API: `sha256:3e60a84629680740238f086099927458cf4801fd174c290c9ce84e7f6f5c0c8b` (537,454,697 bytes).
- Worker: `sha256:0abf6c5c69177fef044501a93087205460b0ce796a34206bbccb99685849f91d` (553,253,609 bytes).
- Web: `sha256:13eb6ddd979c7c361c99c9217f10386e4a111dc5deb4cbe878f7a1cc500ab7d4` (915,909,657 bytes).
Ignored `.local/phase8` contains local build/scan artifacts; Trivy uses a cache volume and
read-only image archives, never the Docker socket. No Docker Hub login was performed.

## Remaining owner / deployment checklist

- [ ] Resolve or explicitly review remaining dependency/container findings before launch.
- [x] Finish final local full checkpoint and combined SQL/HTTP rerun.
- [x] Finish lean-image scans; completed scans are not clean.
- [ ] Remediate or explicitly review findings before release, including bundled npm and OS applicability.
- [ ] Review safety-critical residual Phase 5/6 cases, including auth cross-tab/reuse matrix.
- [ ] Supply Railway project/region, same-site domains, monthly budget and cost-control choices.
- [ ] Explicitly authorize provisioning; verify private services, secrets, migrations,
  controlled seed, scheduler singleton replacement, health/restarts and deployment rollback.
- [ ] Agree backup RPO/RTO/retention/access/storage and alert destinations; configure and
  verify real scheduled backups, restore and alert delivery. Local drill is not that evidence.
- [ ] Authorize consented Meta test-asset end-to-end checks separately. No live send yet.
- [ ] Measure agreed pilot workload; do not advertise 1,200-user capacity without deployed tests.
- [ ] Owner completes staging QA, launch approval and post-deploy smoke checks.

TASK-082 through TASK-086 remote gates remain open. This report does not waive the detailed
test matrices or claim all pending role/filter/UI/race/scale combinations are verified.
