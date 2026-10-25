import assert from "node:assert/strict";
import test from "node:test";
import { CampaignPreflightService } from "./campaign-preflight.service.js";

const context = {
  runId: "00000000-0000-4000-8000-000000000001",
  tenantId: "00000000-0000-4000-8000-000000000002",
  campaignId: "00000000-0000-4000-8000-000000000003",
  requestedBy: "00000000-0000-4000-8000-000000000004",
  requestId: "request-1",
  contentVersion: 2,
  currentContentVersion: 2,
  campaignStatus: "DRAFT",
  campaignApprovalStatus: "NOT_REQUIRED",
  campaignApprovedVersion: null,
  audienceDefinition: { version: 1, contactIds: ["a"], groupIds: ["g"] },
  variableMapping: { "1": { source: "CONTACT_FIELD", field: "name" } },
  tenantStatus: "ACTIVE",
  accountStatus: "CONNECTED",
  credentialStatus: "ACTIVE",
  templateProviderStatus: "APPROVED",
  templateApprovalStatus: "NOT_REQUIRED",
  templateContentVersion: 1,
  templateApprovedVersion: null,
  templateComponents: [{ type: "BODY", text: "Hello {{1}}" }],
  subscriptionStatus: "ACTIVE",
  planStatus: "ACTIVE",
  planLimits: { monthly_message_limit: 10 },
  monthlyUsed: 9,
};

void test("preflight deduplicates selections, snapshots recipient reasons and blocks quota truncation", async () => {
  const writes: unknown[] = [];
  const completions: unknown[] = [];
  const repository = {
    claim: () => Promise.resolve(context),
    contacts: () =>
      Promise.resolve([
        {
          id: "1",
          phoneE164: "+919876543210",
          name: "Ada",
          email: null,
          consentStatus: "OPTED_IN",
          selectionCount: 2,
        },
        {
          id: "2",
          phoneE164: "+919876543211",
          name: null,
          email: null,
          consentStatus: "OPTED_IN",
          selectionCount: 1,
        },
        {
          id: "3",
          phoneE164: "+919876543212",
          name: "No",
          email: null,
          consentStatus: "SUPPRESSED",
          selectionCount: 1,
        },
      ]),
    groupMembershipCount: () => Promise.resolve(3),
    replaceRecipients: (_client: unknown, _context: unknown, rows: unknown) => {
      writes.push(rows);
      return Promise.resolve();
    },
    complete: (_client: unknown, _context: unknown, blockers: unknown, estimates: unknown) => {
      completions.push({ blockers, estimates });
      return Promise.resolve();
    },
  };
  const transactions = { execute: <T>(work: (client: never) => Promise<T>) => work({} as never) };
  await new CampaignPreflightService(repository as never, transactions as never).process(
    context.runId,
  );
  const rows = writes[0] as readonly { status: string; skipOrErrorCode: string | null }[];
  assert.deepEqual(
    rows.map((row) => [row.status, row.skipOrErrorCode]),
    [
      ["PENDING", null],
      ["SKIPPED", "MISSING_VARIABLE:1"],
      ["SKIPPED", "CONTACT_SUPPRESSED"],
    ],
  );
  const result = completions[0] as {
    blockers: readonly string[];
    estimates: { duplicateSelections: number; eligibleRecipients: number };
  };
  assert.deepEqual(result.blockers, []);
  assert.equal(result.estimates.duplicateSelections, 1);
  assert.equal(result.estimates.eligibleRecipients, 1);
});

void test("preflight reports approval, unsupported component, mapping and insufficient quota blockers", async () => {
  const completions: unknown[] = [];
  const repository = {
    claim: () =>
      Promise.resolve({
        ...context,
        campaignApprovalStatus: "DRAFT",
        templateComponents: [
          { type: "BODY", text: "{{1}} {{2}}" },
          { type: "BUTTONS", buttons: [] },
        ],
        monthlyUsed: 10,
      }),
    contacts: () =>
      Promise.resolve([
        {
          id: "1",
          phoneE164: "+919876543210",
          name: "Ada",
          email: null,
          consentStatus: "OPTED_IN",
          selectionCount: 1,
        },
      ]),
    groupMembershipCount: () => Promise.resolve(0),
    replaceRecipients: () => Promise.resolve(),
    complete: (_client: unknown, _context: unknown, blockers: unknown, estimates: unknown) => {
      completions.push({ blockers, estimates });
      return Promise.resolve();
    },
  };
  const transactions = { execute: <T>(work: (client: never) => Promise<T>) => work({} as never) };
  await new CampaignPreflightService(repository as never, transactions as never).process(
    context.runId,
  );
  const blockers = (completions[0] as { blockers: readonly string[] }).blockers;
  assert.deepEqual(blockers, [
    "CAMPAIGN_APPROVAL_REQUIRED",
    "MESSAGE_QUOTA_INSUFFICIENT",
    "TEMPLATE_BUTTONS_UNSUPPORTED",
    "TEMPLATE_VARIABLE_MAPPING_INVALID",
  ]);
});
