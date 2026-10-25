import assert from "node:assert/strict";
import test from "node:test";
import type { RuntimeConfig } from "@whatsapp-platform/config/runtime";
import type { S3ObjectStorage } from "@whatsapp-platform/storage";

import type { ContactImportRepository } from "./contact-import.repository.js";
import { ContactImportService } from "./contact-import.service.js";

const contactImport = {
  defaultCountryCode: "IN",
  id: "0e6fae76-c87c-4f59-b43e-5117f60cc9f",
  mapping: { name: "name", phone: "phone" },
  originalFilename: "contacts.csv",
  storageKey: "contact-imports/test.csv",
  tenantId: "dd2c15f7-a1d9-4a1a-9587-08a4a6334c14",
};

void test("contact import keeps the first valid in-file phone and reports later duplicates", async () => {
  const writes: unknown[] = [];
  const errors: unknown[] = [];
  const completions: unknown[] = [];
  const repository = {
    appendErrors: (_id: string, value: unknown) => {
      errors.push(value);
      return Promise.resolve();
    },
    begin: () => Promise.resolve(contactImport),
    complete: (_id: string, value: unknown) => {
      completions.push(value);
      return Promise.resolve();
    },
    hasActiveGroup: () => Promise.resolve(true),
    insertBatch: (_tenant: string, contacts: readonly { phoneE164: string }[]) => {
      writes.push(contacts);
      return Promise.resolve(new Set(contacts.map((contact) => contact.phoneE164)));
    },
    fail: () => Promise.resolve(),
  } as unknown as ContactImportRepository;
  const storage = {
    get: () =>
      Promise.resolve({
        body: Buffer.from(
          "phone,name\n9876543210,Ada\n9876543210,Ada again\nnot-a-phone,Invalid\n",
        ),
        contentType: "text/csv",
      }),
  } as unknown as S3ObjectStorage;
  const service = new ContactImportService(repository, storage, runtimeConfig());

  await service.process(contactImport.id);

  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], [
    {
      consentAt: null,
      consentProofReference: null,
      consentSource: null,
      consentStatus: "UNKNOWN",
      address: null,
      company: null,
      customFields: {},
      email: null,
      name: "Ada",
      phoneE164: "+919876543210",
    },
  ]);
  assert.deepEqual(completions, [{ insertedRows: 1, invalidRows: 2, totalRows: 3 }]);
  assert.equal(errors.length, 1);
  assert.equal((errors[0] as { readonly length: number }).length, 2);
});

void test("contact import fails without retry when its saved mapping is malformed", async () => {
  const failures: unknown[] = [];
  const repository = {
    begin: () => Promise.resolve({ ...contactImport, mapping: {} }),
    fail: (_id: string, code: unknown) => {
      failures.push(code);
      return Promise.resolve();
    },
  } as unknown as ContactImportRepository;
  const storage = {
    get: () => Promise.reject(new Error("not reached")),
  } as unknown as S3ObjectStorage;
  const service = new ContactImportService(repository, storage, runtimeConfig());

  await service.process(contactImport.id);

  assert.deepEqual(failures, ["CONTACT_IMPORT_MAPPING_INVALID"]);
});

function runtimeConfig(): RuntimeConfig {
  return {
    imports: {
      maxAttempts: 3,
      outboxLockTimeoutSeconds: 300,
      processingTimeoutSeconds: 900,
      queueConcurrency: 1,
      relayPollIntervalMs: 1_000,
      retryBaseDelayMs: 5_000,
    },
    uploads: {
      importRetentionDays: 30,
      maxImportFileBytes: 10_485_760,
      maxImportFileRows: 10_000,
      maxMediaFileBytes: 1,
    },
  } as RuntimeConfig;
}
