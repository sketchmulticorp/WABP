import assert from "node:assert/strict";
import test from "node:test";

import type { AuthorizationContext } from "../authorization/authorization.types.js";
import type { DatabaseTransactionManager } from "../database/database-transaction.manager.js";
import type { AppDatabaseTransaction } from "../database/database.types.js";
import type { WhatsAppProvider } from "../whatsapp/whatsapp-provider.types.js";
import type { TemplateRepository } from "./template.repository.js";
import { TemplateService } from "./template.service.js";

const userContext: AuthorizationContext = {
  actorId: "00000000-0000-4000-8000-000000000001",
  email: "user@example.test",
  isPlatformActor: false,
  permissions: new Set(["template.write"]),
  requestId: "request-1",
  roleId: "00000000-0000-4000-8000-000000000002",
  roleName: "Tenant User",
  roleSystemKey: "TENANT_USER",
  sessionId: "00000000-0000-4000-8000-000000000003",
  tenantId: "00000000-0000-4000-8000-000000000004",
};

const transactions = {
  execute: <T>(work: (transaction: AppDatabaseTransaction) => Promise<T>) =>
    work({} as AppDatabaseTransaction),
} as unknown as DatabaseTransactionManager;

const provider = {
  disconnectAccount: () => Promise.resolve(),
  sendTemplate: () => Promise.reject(new Error("unused")),
  sendText: () => Promise.reject(new Error("not used by this test")),
  syncAccount: () => Promise.reject(new Error("not used by this test")),
  syncTemplates: () => Promise.reject(new Error("not used by this test")),
} satisfies WhatsAppProvider;

void test("User material template edits reset internal approval and increment the expected version", async () => {
  let approvalStatus: string | undefined;
  let expectedVersion: number | undefined;
  const repository = {
    audit: () => Promise.resolve(),
    updateMaterial: (
      _transaction: unknown,
      _tenantId: string,
      _templateId: string,
      status: string,
      input: { readonly expectedContentVersion: number },
    ) => {
      approvalStatus = status;
      expectedVersion = input.expectedContentVersion;
      return Promise.resolve({ id: "00000000-0000-4000-8000-000000000005", contentVersion: 3 });
    },
  } as unknown as TemplateRepository;
  const service = new TemplateService(repository, transactions, provider);

  const result = await service.update(userContext, "00000000-0000-4000-8000-000000000005", {
    category: "UTILITY",
    components: [{ type: "BODY", text: "Updated {{1}}" }],
    expectedContentVersion: 2,
    language: "en_US",
    name: "updated_template",
  });

  assert.equal(result.contentVersion, 3);
  assert.equal(approvalStatus, "DRAFT");
  assert.equal(expectedVersion, 2);
});

void test("Tenant Admin cannot approve a template they requested", async () => {
  const adminContext: AuthorizationContext = { ...userContext, roleSystemKey: "TENANT_ADMIN" };
  const repository = {
    findActive: () => Promise.resolve({ approvalRequestedBy: adminContext.actorId }),
  } as unknown as TemplateRepository;
  const service = new TemplateService(repository, transactions, provider);

  await assert.rejects(
    () => service.approve(adminContext, "00000000-0000-4000-8000-000000000005", 1),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "FORBIDDEN",
  );
});
