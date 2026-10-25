import { Injectable } from "@nestjs/common";
import { CampaignPreflightRepository } from "./campaign-preflight.repository.js";
import { CampaignPreflightTransactionManager } from "./campaign-preflight-transaction.manager.js";
import type {
  PreflightContact,
  PreflightContext,
  RecipientSnapshot,
} from "./campaign-preflight.types.js";

type Mapping = Readonly<
  Record<
    string,
    | { source: "LITERAL"; value: string }
    | { source: "CONTACT_FIELD"; field: "name" | "email" | "phone_e164" }
  >
>;

/** Owns deterministic audience expansion and policy diagnostics; it never reserves quota or sends. */
@Injectable()
export class CampaignPreflightService {
  constructor(
    private readonly repository: CampaignPreflightRepository,
    private readonly transactions: CampaignPreflightTransactionManager,
  ) {}

  async process(runId: string): Promise<void> {
    await this.transactions.execute(async (client) => {
      const context = await this.repository.claim(client, runId);
      if (context === undefined) return;
      if (
        context.contentVersion !== context.currentContentVersion ||
        !["DRAFT", "QUEUED", "SCHEDULED"].includes(context.campaignStatus) ||
        context.campaignStartedAt != null
      ) {
        await this.repository.supersede(runId, client);
        return;
      }
      const mapping = readMapping(context.variableMapping);
      const template = inspectTemplate(context.templateComponents);
      const [contacts, groupMemberships] = await Promise.all([
        this.repository.contacts(client, context),
        this.repository.groupMembershipCount(client, context),
      ]);
      const snapshots = contacts.map((contact) => recipient(contact, mapping));
      const eligibleRecipients = snapshots.filter((row) => row.status === "PENDING").length;
      const skippedByReason = countSkipped(snapshots);
      const monthlyLimit = messageLimit(context.planLimits) ?? 0;
      const monthlyRemaining = Math.max(0, monthlyLimit - context.monthlyUsed);
      const blockers = globalBlockers(
        context,
        template,
        mapping,
        eligibleRecipients,
        monthlyRemaining,
      );
      const audience = readAudience(context.audienceDefinition);
      const estimates = {
        selectedContacts: audience.contactIds.length,
        groupMemberships,
        duplicateSelections: contacts.reduce(
          (total, contact) => total + Math.max(0, contact.selectionCount - 1),
          0,
        ),
        resolvedRecipients: contacts.length,
        eligibleRecipients,
        skippedRecipients: snapshots.length - eligibleRecipients,
        skippedByReason,
        monthlyLimit,
        monthlyUsed: context.monthlyUsed,
        monthlyRemaining,
        estimatedUsage: eligibleRecipients,
        remainingAfterSend: monthlyRemaining - eligibleRecipients,
      };
      await this.repository.replaceRecipients(client, context, snapshots);
      await this.repository.complete(client, context, blockers, estimates);
    });
  }

  async fail(runId: string): Promise<void> {
    await this.transactions.execute((client) =>
      this.repository.fail(runId, client, "CAMPAIGN_PREFLIGHT_PROCESSING_FAILED"),
    );
  }
}

function recipient(contact: PreflightContact, mapping: Mapping): RecipientSnapshot {
  if (!/^\+[1-9]\d{7,14}$/u.test(contact.phoneE164))
    return skipped(contact.id, "CONTACT_PHONE_INVALID");
  if (contact.consentStatus === "OPTED_OUT") return skipped(contact.id, "CONTACT_OPTED_OUT");
  if (contact.consentStatus === "SUPPRESSED") return skipped(contact.id, "CONTACT_SUPPRESSED");
  if (contact.consentStatus !== "OPTED_IN") return skipped(contact.id, "CONTACT_OPT_IN_REQUIRED");
  const rendered: Record<string, string> = {};
  for (const [key, source] of Object.entries(mapping)) {
    const value = source.source === "LITERAL" ? source.value : contactValue(contact, source.field);
    if (value === null || value.trim().length === 0)
      return skipped(contact.id, `MISSING_VARIABLE:${key}`);
    rendered[key] = value.trim();
  }
  return {
    contactId: contact.id,
    status: "PENDING",
    renderedVariables: rendered,
    skipOrErrorCode: null,
  };
}
function skipped(contactId: string, code: string): RecipientSnapshot {
  return { contactId, status: "SKIPPED", renderedVariables: {}, skipOrErrorCode: code };
}
function contactValue(contact: PreflightContact, field: "name" | "email" | "phone_e164") {
  if (field === "name") return contact.name;
  if (field === "email") return contact.email;
  return contact.phoneE164;
}
function globalBlockers(
  context: PreflightContext,
  template: TemplateInspection,
  mapping: Mapping,
  eligible: number,
  remaining: number,
) {
  const blockers = new Set<string>();
  if (
    context.pinnedTemplateVersion != null &&
    context.pinnedTemplateVersion !== context.templateContentVersion
  )
    blockers.add("CAMPAIGN_TEMPLATE_CHANGED");
  if (context.tenantStatus !== "ACTIVE") blockers.add("TENANT_NOT_ACTIVE");
  if (!(["ACTIVE", "TRIAL"] as const).includes(context.subscriptionStatus as "ACTIVE" | "TRIAL"))
    blockers.add("SUBSCRIPTION_NOT_ACTIVE");
  if (context.planStatus !== "ACTIVE" || messageLimit(context.planLimits) === null)
    blockers.add("PLAN_MESSAGE_LIMIT_INVALID");
  if (context.accountStatus !== "CONNECTED" || context.credentialStatus !== "ACTIVE")
    blockers.add("WHATSAPP_ACCOUNT_NOT_CONNECTED");
  if (context.templateProviderStatus !== "APPROVED") blockers.add("WHATSAPP_TEMPLATE_NOT_APPROVED");
  if (
    context.templateApprovalStatus !== "NOT_REQUIRED" &&
    !(
      context.templateApprovalStatus === "APPROVED" &&
      context.templateApprovedVersion === context.templateContentVersion
    )
  )
    blockers.add("TEMPLATE_INTERNAL_APPROVAL_REQUIRED");
  if (
    context.campaignApprovalStatus !== "NOT_REQUIRED" &&
    !(
      context.campaignApprovalStatus === "APPROVED" &&
      context.campaignApprovedVersion === context.contentVersion
    )
  )
    blockers.add("CAMPAIGN_APPROVAL_REQUIRED");
  for (const blocker of template.blockers) blockers.add(blocker);
  const mappingKeys = Object.keys(mapping).sort();
  if (JSON.stringify(mappingKeys) !== JSON.stringify([...template.variables].sort()))
    blockers.add("TEMPLATE_VARIABLE_MAPPING_INVALID");
  if (eligible === 0) blockers.add("NO_ELIGIBLE_RECIPIENTS");
  if (eligible > remaining) blockers.add("MESSAGE_QUOTA_INSUFFICIENT");
  return [...blockers].sort();
}
interface TemplateInspection {
  readonly variables: ReadonlySet<string>;
  readonly blockers: readonly string[];
}
function inspectTemplate(value: unknown): TemplateInspection {
  if (!Array.isArray(value))
    return { variables: new Set(), blockers: ["TEMPLATE_COMPONENTS_INVALID"] };
  const variables = new Set<string>();
  const blockers = new Set<string>();
  for (const component of value) {
    if (typeof component !== "object" || component === null || Array.isArray(component)) {
      blockers.add("TEMPLATE_COMPONENTS_INVALID");
      continue;
    }
    const entry = component as Record<string, unknown>;
    if (typeof entry.type !== "string") blockers.add("TEMPLATE_COMPONENTS_INVALID");
    const type = typeof entry.type === "string" ? entry.type.toUpperCase() : "";
    if (type === "BUTTONS") {
      blockers.add("TEMPLATE_BUTTONS_UNSUPPORTED");
      continue;
    }
    if (type !== "BODY" && type !== "HEADER") continue;
    if (type === "HEADER" && entry.format !== "TEXT") {
      blockers.add("TEMPLATE_MEDIA_UNSUPPORTED");
      continue;
    }
    if (typeof entry.text !== "string") continue;
    const componentKeys = [
      ...new Set(
        [...entry.text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*|\d+)\s*\}\}/gu)].map(
          (match) => match[1] ?? "",
        ),
      ),
    ];
    const numeric = componentKeys.filter((key) => /^\d+$/u.test(key));
    if (
      numeric.length > 0 &&
      (numeric.length !== componentKeys.length ||
        numeric
          .sort((a, b) => Number(a) - Number(b))
          .some((key, index) => Number(key) !== index + 1))
    )
      blockers.add("TEMPLATE_PARAMETERS_UNSUPPORTED");
    for (const key of componentKeys) variables.add(key);
  }
  return { variables, blockers: [...blockers] };
}
function readMapping(value: unknown): Mapping {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as Mapping;
}
function readAudience(value: unknown): {
  contactIds: readonly string[];
  groupIds: readonly string[];
} {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { contactIds: [], groupIds: [] };
  const row = value as Record<string, unknown>;
  return {
    contactIds: Array.isArray(row.contactIds)
      ? row.contactIds.filter((v): v is string => typeof v === "string")
      : [],
    groupIds: Array.isArray(row.groupIds)
      ? row.groupIds.filter((v): v is string => typeof v === "string")
      : [],
  };
}
function messageLimit(value: unknown): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const limit = (value as Record<string, unknown>).monthly_message_limit;
  return typeof limit === "number" && Number.isSafeInteger(limit) && limit >= 0 ? limit : null;
}
function countSkipped(rows: readonly RecipientSnapshot[]) {
  const counts: Record<string, number> = {};
  for (const row of rows)
    if (row.skipOrErrorCode !== null)
      counts[row.skipOrErrorCode] = (counts[row.skipOrErrorCode] ?? 0) + 1;
  return counts;
}
