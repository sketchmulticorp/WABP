# ADR-025 — Same-origin limited-preview API proxy

Approved 2026-10-19, CLAR-066; TASK-082.4.2.2.

## Decision

The owner has no custom domain. Separate Railway Web/API domains must not be assumed
same-site for Strict refresh cookies. Use Next.js's built-in fixed-target external rewrite
for /api/v1/:path*. Browser stays on Web HTTPS; NestJS remains a separate service and sole
owner of authentication, authorization, tenancy, persistence and business logic. No custom
auth relay, dependency, paid service or domain purchase.

Web uses NEXT_PUBLIC_API_URL=/api/v1 and API_PROXY_URL ending in /api/v1. The fixed upstream
accepts HTTPS or HTTP on a .railway.internal hostname only, without credentials, query,
fragment or another path. HTTP is allowed only for Railway private networking, not public
browser traffic. No browser-provided URL selects a target. This is not an open proxy.
The upstream is configuration, not a secret: rewrite metadata can appear in build artifacts.
Never include tokens/passwords. Built-in routing forwards requests to existing API routes.

Keep original Origin validation, bearer/live-session checks and host-only refresh cookies:
Secure, HttpOnly, SameSite=Strict, Path=/api/v1/auth. No cookie Domain rewrite, weaker cookie
policy, TLS bypass or browser token persistence. Only /api/v1 is proxied; Railway checks API
health directly. API need not have a public domain. Public exposure requires owner approval.
Preview's backend allowlist still excludes unsupported features.

## Operation and trade-offs

Set both Web variables at build and runtime; changes require rebuilding Web. Turbo includes
both cache inputs; next.config.mjs is included in the lean runtime package. Existing browser
adapter already supports relative URLs. Without API_PROXY_URL, absolute local/full routing
is unchanged. Built-in proxy timeout/body limits remain; this scope is small preview JSON,
not large uploads, webhooks or new protocols. One extra hop avoids another service/domain.

Keep trust-proxy 0 until ingress verification; login IP throttling may aggregate by proxy
address. Do not blindly trust forwarded headers. A custom same-site domain is a later option;
weakening cookies or moving backend logic into Next.js was rejected.

## Verification and rollback

Automated tests remain owner-deferred. Pending: real HTTPS cookies/rotation/reload/logout,
Origin rejection, method/body/query/Authorization transport, upstream failure, invalid
config, Docker packaging/private DNS, disabled routes and full/direct regression. Static
checks do not certify these behaviors or customer readiness. No hosted login claimed.

Rollback by rebuilding Web with absolute API URL and API_PROXY_URL unset, only with verified
same-site domains for browser authentication. No database migration or rollback required.
