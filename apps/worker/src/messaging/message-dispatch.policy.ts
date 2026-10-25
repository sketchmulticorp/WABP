import type {
  SendTemplateInput,
  TemplateTextComponent,
  InteractiveMessageContent,
} from "@whatsapp-platform/whatsapp-provider";
import type { DeliverySnapshot } from "./message-delivery.types.js";

/** Live dispatch checks reuse the composition invariants without reserving quota again. */
export function dispatchBlock(message: DeliverySnapshot, now: number): string | null {
  if (message.policy_decision.source === "AUTOMATION") {
    const runtime = message.automation,
      evidence = message.policy_decision.automation;
    if (isRecord(runtime) && runtime.entitled !== true) return "AUTOMATION_NOT_ENTITLED";
    if (
      !isRecord(runtime) ||
      !isRecord(evidence) ||
      runtime.publisherActive !== true ||
      runtime.publisherId !== evidence.publisherId ||
      runtime.versionId !== evidence.versionId ||
      runtime.accountId !== message.whatsapp_account_id ||
      runtime.flowStatus !== "ACTIVE" ||
      !["RUNNING", "WAITING"].includes(String(runtime.runStatus)) ||
      runtime.conversationState !== "ACTIVE"
    )
      return "AUTOMATION_OWNERSHIP_CHANGED";
  }
  if (message.policy_decision.outcome !== "ALLOWED") return "MESSAGE_POLICY_NOT_ALLOWED";
  if (message.tenant_status !== "ACTIVE") return "TENANT_NOT_ACTIVE";
  if (
    !["ACTIVE", "TRIAL"].includes(message.subscription_status ?? "") ||
    message.plan_status !== "ACTIVE"
  )
    return "SUBSCRIPTION_NOT_ACTIVE";
  if (
    message.account_status !== "CONNECTED" ||
    message.credential_status !== "ACTIVE" ||
    message.secret_ref === null
  )
    return "WHATSAPP_ACCOUNT_NOT_CONNECTED";
  if (message.phone_e164 === null || message.consent_status === null) return "CONTACT_NOT_ACTIVE";
  if (["OPTED_OUT", "SUPPRESSED"].includes(message.consent_status))
    return "CONTACT_MESSAGING_BLOCKED";
  if (message.campaign_id !== null || message.policy_decision.source === "CAMPAIGN") {
    const campaign = message.campaign;
    const evidence = message.policy_decision.campaign;
    if (!isRecord(campaign) || !isRecord(evidence) || campaign.senderActive !== true)
      return "CAMPAIGN_ACCESS_CHANGED";
    if (campaign.status === "PAUSED") return "CAMPAIGN_PAUSED";
    if (campaign.status !== "RUNNING") return "CAMPAIGN_NOT_RUNNING";
    if (
      campaign.contentVersion !== evidence.contentVersion ||
      campaign.templateContentVersion !== evidence.templateContentVersion ||
      !(
        campaign.approvalStatus === "NOT_REQUIRED" ||
        (campaign.approvalStatus === "APPROVED" &&
          campaign.approvedVersion === campaign.contentVersion &&
          campaign.reviewerActive === true)
      )
    )
      return "CAMPAIGN_APPROVAL_CHANGED";
    if (message.template?.content_version !== campaign.templateContentVersion)
      return "CAMPAIGN_TEMPLATE_CHANGED";
  }
  if (message.message_type === "TEXT") {
    return message.window_expires_at !== null &&
      new Date(message.window_expires_at).getTime() > now &&
      typeof message.content.text === "string" &&
      message.content.text.length > 0
      ? null
      : "CUSTOMER_SERVICE_WINDOW_CLOSED";
  }
  if (message.message_type === "INTERACTIVE") {
    if (message.policy_decision.source !== "AUTOMATION") return "MESSAGE_TYPE_NOT_SUPPORTED";
    if (message.window_expires_at === null || Date.parse(message.window_expires_at) <= now)
      return "CUSTOMER_SERVICE_WINDOW_CLOSED";
    try {
      interactiveContent(message);
      return null;
    } catch {
      return "INTERACTIVE_CONTENT_INVALID";
    }
  }
  if (message.message_type !== "TEMPLATE") return "MESSAGE_TYPE_NOT_SUPPORTED";
  if (message.consent_status !== "OPTED_IN") return "CONTACT_OPT_IN_REQUIRED";
  const template = message.template;
  const approved = message.policy_decision.template;
  if (
    template === null ||
    !isRecord(approved) ||
    approved.contentVersion !== template.content_version ||
    template.name !== message.content.name ||
    template.language !== message.content.language ||
    template.provider_status !== "APPROVED" ||
    !(
      template.approval_status === "NOT_REQUIRED" ||
      (template.approval_status === "APPROVED" &&
        template.approved_version === template.content_version)
    )
  ) {
    return "TEMPLATE_APPROVAL_CHANGED";
  }
  return null;
}
export function interactiveContent(message: DeliverySnapshot): InteractiveMessageContent {
  const content = message.content,
    raw = content.choices;
  if (
    (content.kind !== "BUTTONS" && content.kind !== "LIST") ||
    typeof content.text !== "string" ||
    content.text.length < 1 ||
    content.text.length > 1024 ||
    !Array.isArray(raw) ||
    raw.length < 1 ||
    raw.length > (content.kind === "BUTTONS" ? 3 : 10)
  )
    throw new Error("INTERACTIVE_CONTENT_INVALID");
  const choices = raw.map((value: unknown) => {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.title !== "string" ||
      value.id.length < 1 ||
      value.id.length > 200 ||
      value.title.trim().length < 1 ||
      value.title.length > (content.kind === "BUTTONS" ? 20 : 24)
    )
      throw new Error("INTERACTIVE_CONTENT_INVALID");
    return { id: value.id, title: value.title };
  });
  if (new Set(choices.map((c) => c.id)).size !== choices.length)
    throw new Error("INTERACTIVE_CONTENT_INVALID");
  return { kind: content.kind, text: content.text, choices };
}

/** Only the text parameter shapes supported by this MVP are passed to the adapter. */
export function templateContent(
  message: DeliverySnapshot,
): Pick<SendTemplateInput, "name" | "language" | "components"> {
  const template = message.template;
  const variables = message.content.variables;
  if (
    template === null ||
    !Array.isArray(template.components) ||
    !isRecord(variables) ||
    typeof message.content.name !== "string" ||
    typeof message.content.language !== "string"
  )
    throw new Error("TEMPLATE_PARAMETERS_UNSUPPORTED");
  const components: TemplateTextComponent[] = [];
  const used = new Set<string>();
  for (const component of template.components) {
    if (!isRecord(component) || typeof component.type !== "string")
      throw new Error("TEMPLATE_PARAMETERS_UNSUPPORTED");
    const type = component.type.toLowerCase();
    if (type === "buttons" || (type === "header" && component.format !== "TEXT"))
      throw new Error("TEMPLATE_PARAMETERS_UNSUPPORTED");
    if (type !== "body" && type !== "header") continue;
    const text = typeof component.text === "string" ? component.text : "";
    const keys = [
      ...new Set(
        [...text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*|\d+)\s*\}\}/gu)].map(
          (match) => match[1] ?? "",
        ),
      ),
    ];
    if (keys.length === 0) continue;
    const numeric = keys.every((key) => /^\d+$/u.test(key));
    if (numeric) {
      keys.sort((a, b) => Number(a) - Number(b));
      if (keys.some((key, index) => Number(key) !== index + 1))
        throw new Error("TEMPLATE_PARAMETERS_UNSUPPORTED");
    } else if (keys.some((key) => /^\d+$/u.test(key)))
      throw new Error("TEMPLATE_PARAMETERS_UNSUPPORTED");
    components.push({
      type,
      parameters: keys.map((key) => {
        const value = variables[key];
        if (typeof value !== "string" || value.trim().length === 0)
          throw new Error("TEMPLATE_PARAMETERS_UNSUPPORTED");
        used.add(key);
        return { type: "text", text: value, ...(numeric ? {} : { parameter_name: key }) };
      }),
    });
  }
  if (Object.keys(variables).some((key) => !used.has(key)))
    throw new Error("TEMPLATE_PARAMETERS_UNSUPPORTED");
  return { name: message.content.name, language: message.content.language, components };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
