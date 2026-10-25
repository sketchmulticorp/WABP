import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";

import type { AuthorizationContext } from "../authorization/authorization.types.js";
import type { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import { parseDevelopmentConnectionInput } from "./whatsapp.dto.js";
import type { WhatsAppProvider } from "./whatsapp-provider.types.js";
import type { WhatsAppRepository } from "./whatsapp.repository.js";
import { WhatsAppService } from "./whatsapp.service.js";

const tenantContext: AuthorizationContext = {
  actorId: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.test",
  isPlatformActor: false,
  permissions: new Set(["whatsapp.connect"]),
  requestId: "request-1",
  roleId: "00000000-0000-4000-8000-000000000002",
  roleName: "Tenant Admin",
  roleSystemKey: "TENANT_ADMIN",
  sessionId: "00000000-0000-4000-8000-000000000003",
  tenantId: "00000000-0000-4000-8000-000000000004",
};

const provider = {
  disconnectAccount: () => Promise.resolve(),
  sendTemplate: () => Promise.reject(new Error("unused")),
  sendText: () => Promise.reject(new Error("not used by this test")),
  syncAccount: () => Promise.reject(new Error("not used by this test")),
  syncTemplates: () => Promise.reject(new Error("not used by this test")),
} satisfies WhatsAppProvider;

void test("development connection persists an account and appends audit evidence in one transaction", async () => {
  const calls: string[] = [];
  const repository = {
    connectDevelopmentAccount: (_transaction: unknown, tenantId: string) => {
      calls.push(`account:${tenantId}`);
      return Promise.resolve({
        displayPhone: "+15551234567",
        id: "00000000-0000-4000-8000-000000000005",
        phoneNumberId: "test-phone-id",
        status: "CONNECTED",
        wabaId: "test-waba-id",
      });
    },
    recordConnectionAudit: (_transaction: unknown, input: { readonly tenantId: string }) => {
      calls.push(`audit:${input.tenantId}`);
      return Promise.resolve();
    },
  } as unknown as WhatsAppRepository;
  const transactions = {
    execute: <T>(work: (transaction: AppDatabaseTransaction) => Promise<T>) =>
      work({} as AppDatabaseTransaction),
  } as unknown as DatabaseTransactionManager;
  const service = new WhatsAppService(repository, transactions, provider);

  const result = await service.connectDevelopmentAccount(
    tenantContext,
    parseDevelopmentConnectionInput({
      display_phone: "+15551234567",
      phone_number_id: "test-phone-id",
      secret_ref: "env://META_TEST_SYSTEM_USER_TOKEN",
      waba_id: "test-waba-id",
    }),
  );

  assert.equal(result.status, "CONNECTED");
  assert.deepEqual(calls, [
    "account:00000000-0000-4000-8000-000000000004",
    "audit:00000000-0000-4000-8000-000000000004",
  ]);
});

void test("development connection accepts only a server-side credential reference", () => {
  assert.throws(
    () =>
      parseDevelopmentConnectionInput({
        display_phone: "+15551234567",
        phone_number_id: "test-phone-id",
        secret_ref: "actual-provider-token",
        waba_id: "test-waba-id",
      }),
    BadRequestException,
  );
  assert.throws(
    () =>
      parseDevelopmentConnectionInput({
        display_phone: "+15551234567",
        phone_number_id: "test-phone-id",
        secret_ref: "https://credential-value.example.test",
        waba_id: "test-waba-id",
      }),
    BadRequestException,
  );
});

void test("account sync calls the provider before atomically persisting health and audit evidence", async () => {
  const calls: string[] = [];
  const repository = {
    applySync: (_transaction: unknown, tenantId: string, accountId: string) => {
      calls.push(`save:${tenantId}:${accountId}`);
      return Promise.resolve({ id: accountId, status: "CONNECTED" });
    },
    findAccountForProvider: () =>
      Promise.resolve({
        credentialReference: "env://META_DEVELOPMENT_ACCESS_TOKEN",
        credentialStatus: "ACTIVE",
        id: "00000000-0000-4000-8000-000000000005",
        phoneNumberId: "test-phone-id",
        status: "CONNECTED",
        wabaId: "test-waba-id",
      }),
    recordAccountAudit: (_transaction: unknown, input: { readonly action: string }) => {
      calls.push(`audit:${input.action}`);
      return Promise.resolve();
    },
  } as unknown as WhatsAppRepository;
  const transactions = {
    execute: <T>(work: (transaction: AppDatabaseTransaction) => Promise<T>) =>
      work({} as AppDatabaseTransaction),
  } as unknown as DatabaseTransactionManager;
  const syncProvider = {
    ...provider,
    syncAccount: () => {
      calls.push("provider:sync");
      return Promise.resolve({
        displayName: "Example Clinic",
        displayPhone: "+15551234567",
        health: "CONNECTED" as const,
        phoneNumberId: "test-phone-id",
        qualityRating: "GREEN",
        wabaId: "test-waba-id",
      });
    },
  } satisfies WhatsAppProvider;
  const service = new WhatsAppService(repository, transactions, syncProvider);

  const result = await service.syncAccount(tenantContext, "00000000-0000-4000-8000-000000000005");

  assert.equal(result.status, "CONNECTED");
  assert.deepEqual(calls, [
    "provider:sync",
    "save:00000000-0000-4000-8000-000000000004:00000000-0000-4000-8000-000000000005",
    "audit:WHATSAPP_ACCOUNT_SYNCED",
  ]);
});
