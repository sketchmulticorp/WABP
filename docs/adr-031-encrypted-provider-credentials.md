# ADR-031 — Per-business encrypted provider credentials

Follow-up ADR-032 wires verified direct signup and combined local tests. Pending statements
below describe the storage-only checkpoint; current evidence is in the onboarding test report.

Owner approved2026-10-21, CLAR-071 / TASK-032.2.1. Amends reference-only persistence in ADR-030.

## Decision

Use authenticated AES-256-GCM encryption in existing PostgreSQL, not a new hosted secrets
service. Canonical provider_credentials adds nullable encrypted_token plus a storage CHECK.
The envelope carries format version1, keyId, random12-byte IV,16-byte authentication tag
and ciphertext. Additional authenticated data binds purpose/version/keyId/tenant/account/
credential IDs. secret_ref remains opaque encrypted://<credential-id>, never the token or
ciphertext. Existing reference-only rows are unchanged and continue normal development use.

Server WHATSAPP_CREDENTIAL_KEYRING is a validated JSON map of1–10 key IDs to canonical
base64-encoded random32-byte keys; WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID selects new encryption.
Neither value enters browser config, API responses, audit, Git or DB. Existing DATA_ENCRYPTION_KEY
is not repurposed: its previous loose string contract is not a defined AES key encoding.
No defaults/test keys are installed. Missing/unknown key IDs fail closed without env fallback.
Keep previous keys until credentials/backups no longer need them; automated re-encryption
is not implemented and active-key changes alone do not rotate existing ciphertext.

## Layers and reuse

Shared provider package owns cipher and ProviderCredentialService resolution policy.
ProviderCredentialRepository alone performs SQL, requiring exact reference/account, active
credential and active/non-deleted tenant. The API exports its server-only repository for
Worker reuse via the existing API-runtime dependency pattern; both reuse existing pools.
Provider adapter awaits an injected resolver for every credential-consuming operation.
The old development resolver remains restricted to its existing allowlisted env reference.

Internal ProviderCredentialPersistenceService authorizes Tenant Admin/whatsapp.connect,
locks its tenant account, encrypts, replaces/inserts the stable credential identity and writes
redacted audit in one transaction. This is not a public token-upload API and does not verify
Meta ownership itself: only the future provider-verified signup workflow may call it.
Actual signup creation must coordinate account/credential state atomically; callback wiring
and attempt persistence are still pending and not implied by the storage foundation.

## Tradeoffs and release

Encrypted DB storage avoids another paid service but increases key-management responsibility.
A stolen DB alone lacks keys; a compromised server can access decrypted tokens. Loss of keys
makes tokens/backups unrecoverable; store keys securely outside database backups and restrict
access. Do not remove old keys merely because the active key changes. Normal disconnect uses
credential revocation, not deletion. No upstream revoke/new retention policy added.

Migration0010_encrypted_provider_credentials is additive (11th migration,35 tables).
No existing DB/hosted migration, key generation or backfill performed. Deployment must apply
migrations before new encrypted-credential use and distribute the same keyring to API/Worker.
Combined foundation+secure signup tests are owner-selected; runtime/SQL/security acceptance
is pending, not established by successful compilation or schema metadata checks.
