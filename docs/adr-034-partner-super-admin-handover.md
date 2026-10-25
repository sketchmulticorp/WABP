# ADR-034 — Partner Super Admin creation and password handover

Approved2026-10-25, CLAR-081 / TASK-091. Extends ADR-028 to newly provisioned partner
Super Admins. Existing users.must_change_password and handover machinery are reused;
bootstrap/existing owner defaults are unchanged. No new schema or authentication path.

Existing system Super Admin/user.invite can create a new platform identity using its live
server-selected role, with null home tenant/no membership, strong temporary password and
atomic redacted audit. Existing email identities, including deleted ones, cannot be promoted
or reclaimed. No role fields, listing, editing, deletion, restoration, impersonation or email flow.

Remove the old platform-role restriction from initial-password completion, retaining pending
flag, current-password/reuse/hash checks, rate limiting, principal/session validation, locks,
revoke-all/version/audit/cookie expiry and fresh login. Do not seed or reopen bootstrap to add
partners. No tenant-content privilege expansion. See SUPER_ADMIN_CREATION.md for contract,
security boundaries and pending verification; source implementation is not hosted acceptance.
