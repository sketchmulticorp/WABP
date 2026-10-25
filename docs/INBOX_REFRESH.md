# Inbox refresh foundation — TASK-064

Original foundation checks: web lint/typecheck/production build passed (4 tasks including the
contracts dependency build), formatting and `git diff --check` passed. TASK-066 now mounts this
foundation; TASK-065 runtime evidence and remaining cases are in `PHASE_6_TEST_REPORT.md`.

Approved by CLAR-035 / ADR-021, 2026-10-16. Mounted by TASK-066; the local browser checks use
API doubles, not a full browser/API/worker/provider end-to-end environment.

## Frontend integration contract

`features/inbox/inbox-api.ts` wraps TASK-061–063 list/history/notes/reply/state/assignment
endpoints through the existing authenticated client. GETs are uncached and accept an
AbortSignal. There is no browser-supplied tenant or provider credential. Mutations remain
explicit; reply keys and note UUIDs must be retained for retries as documented separately.
The shared client retains its existing single authentication retry after a 401; this is
not a generic network or mutation retry loop.

`useInboxRefresh(key, load)` returns data, refreshing, error, lastUpdatedAt, stopped and
a stable refresh function. TASK-066 must:

- Mount one hook per active Inbox, with a memoized read-only loader; include authenticated
  user/tenant and all relevant filter/selection identity in key. Pass null when disabled.
- Forward the AbortSignal to every GET. If combining reads, share that signal. A failed
  combined load aborts sibling reads and retains the last complete snapshot on transient
  failure; it does not publish half a snapshot.
- Render retained data with a visible stale/error/refresh status. After 401/403, protected
  data is cleared and automatic refresh stops; use the normal reauthentication/access flow.
- Refresh immediately after successful explicit local actions. Do not put mark-read, sends
  or any other mutation in the loader. GET never sends a read receipt.
- Preserve local drafts and deliberately reconcile pagination/selected conversation when
  refreshing from current server state. Do not blindly replace an older-page cursor chain
  with the first page; the UI's pagination/merge behavior is still TASK-066 design work.
- Use manual refresh for immediate checks. After a terminal error, change the relevant
  authenticated/selection context (or remount after recovery); focus/manual triggers do
  not bypass a stopped authorization state.

## Lifecycle and failures

Initial eligible mount refreshes immediately. Later successful cycles wait 15 seconds
after completion. Focus, visible-tab return, online reconnection, manual refresh and local
action completion can request an immediate cycle. Multiple triggers coalesce into at most
one pending refresh; a slow request is never overlapped by another cycle in that hook.

Hidden/offline state clears timers and aborts active reads. Unmount/key/loader changes
dispose listeners/timers, cancel reads and prevent old completions from updating state.
Old-key payloads are never returned as the new key's data, even during effect cleanup.

Transient failures retry after 30 seconds, then 60 seconds capped; success resets cadence.
Network errors and 408/429/5xx use backoff. Other 4xx errors stop automatic attempts, rather
than repeatedly issuing an invalid request. Timers resume only when mounted/visible/online.
This is browser-local support, not a queue, offline mutation store or cross-tab leader.

## Shared authentication correction

The old client independently rotated on each 401. The changed client shares one in-flight
refresh promise and lets delayed 401s reuse an already-rotated access token. A failed refresh
clears the current token. Login/logout generations reject obsolete protected responses and
prevent an earlier refresh from reinstalling its token. Login/logout wait for an existing
rotation before their auth request; logout uses the server's cookie-authenticated route.

Headers are normalized with Headers, preserving valid object/tuple/Headers input while
setting Authorization. Tokens remain in memory and refresh cookies remain server-controlled;
no storage, logging, cookie policy or server token lifetime was changed.

This is same-runtime coordination, not a guarantee for simultaneous auth actions across
tabs/devices or every cookie-response race. Cross-tab rotation remains pending acceptance
and pre-launch review under TASK-065/084; do not claim it fixed by this change.

## Verification boundary

Web lint explicitly includes features/inbox and the changed shared API client. Automated
tests/test-file changes are deferred to TASK-065; static/build success is not evidence for
browser timing, refresh races or deployed capacity. No live Meta calls are made here.
