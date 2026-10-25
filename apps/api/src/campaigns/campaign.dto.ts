import { BadRequestException } from "@nestjs/common";
import type { CampaignDraftInput, CampaignVariable } from "@whatsapp-platform/contracts";

export interface UpdateCampaignInput extends CampaignDraftInput {
  readonly expectedContentVersion: number;
  readonly expectedRevision: string;
}

export function parseCampaignInput(value: unknown): CampaignDraftInput {
  const body = record(value);
  allowKeys(body, [
    "name",
    "description",
    "whatsappAccountId",
    "templateId",
    "audienceDefinition",
    "variableMapping",
    "expectedContentVersion",
    "expectedRevision",
    "scheduleAt",
    "scheduleTimezone",
  ]);
  const audience = record(body.audienceDefinition);
  allowKeys(audience, ["version", "contactIds", "groupIds"]);
  if (audience.version !== 1) throw invalid("Unsupported audience version.");
  const mappings = record(body.variableMapping);
  if (Object.keys(mappings).length > 100) throw invalid("Too many template variables.");
  const variableMapping: Record<string, CampaignVariable> = {};
  for (const [key, raw] of Object.entries(mappings).sort(([a], [b]) => a.localeCompare(b))) {
    if (
      !/^[a-zA-Z0-9_]{1,64}$/u.test(key) ||
      ["__proto__", "constructor", "prototype"].includes(key)
    )
      throw invalid("Invalid variable key.");
    const mapping = record(raw);
    if (mapping.source === "LITERAL") {
      allowKeys(mapping, ["source", "value"]);
      variableMapping[key] = { source: "LITERAL", value: text(mapping.value, 4000) };
    } else if (mapping.source === "CONTACT_FIELD") {
      allowKeys(mapping, ["source", "field"]);
      if (mapping.field !== "name" && mapping.field !== "email" && mapping.field !== "phone_e164")
        throw invalid("Unsupported Contact field.");
      variableMapping[key] = { source: "CONTACT_FIELD", field: mapping.field };
    } else throw invalid("Unsupported variable source.");
  }
  return {
    name: text(body.name, 120),
    description:
      body.description === null || body.description === undefined
        ? null
        : text(body.description, 1000),
    whatsappAccountId: uuid(body.whatsappAccountId),
    templateId: uuid(body.templateId),
    audienceDefinition: {
      version: 1,
      contactIds: ids(audience.contactIds),
      groupIds: ids(audience.groupIds),
    },
    variableMapping,
    scheduleAt: scheduleAt(body.scheduleAt),
    scheduleTimezone: timezone(body.scheduleTimezone),
  };
}

export function parseCampaignCommand(value: unknown, rejection = false, start = false) {
  const body = record(value);
  allowKeys(body, [
    "expectedContentVersion",
    "expectedRevision",
    ...(rejection ? ["reason"] : []),
    ...(start ? ["idempotencyKey"] : []),
  ]);
  if (
    typeof body.expectedContentVersion !== "number" ||
    !Number.isSafeInteger(body.expectedContentVersion) ||
    body.expectedContentVersion < 1
  )
    throw invalid("expectedContentVersion is required.");
  if (typeof body.expectedRevision !== "string" || !/^[a-f0-9]{64}$/u.test(body.expectedRevision))
    throw invalid("expectedRevision is required.");
  const key = start ? text(body.idempotencyKey, 128) : null;
  if (key !== null && !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(key))
    throw invalid("Invalid idempotencyKey.");
  return {
    expectedContentVersion: body.expectedContentVersion,
    expectedRevision: body.expectedRevision,
    reason: rejection ? text(body.reason, 1000) : null,
    idempotencyKey: key,
  };
}
function scheduleAt(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    !/(Z|[+-]\d{2}:\d{2})$/u.test(value) ||
    Number.isNaN(Date.parse(value))
  )
    throw invalid("Schedule requires an ISO timestamp with timezone.");
  return new Date(value).toISOString();
}
function timezone(value: unknown): string {
  if (value === undefined) return "UTC";
  if (typeof value !== "string" || value.length > 100) throw invalid("Invalid schedule timezone.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch {
    throw invalid("Invalid schedule timezone.");
  }
  return value;
}

export function parseUpdateCampaignInput(value: unknown): UpdateCampaignInput {
  const version = record(value).expectedContentVersion;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1)
    throw invalid("expectedContentVersion is required.");
  const revision = record(value).expectedRevision;
  if (typeof revision !== "string" || !/^[a-f0-9]{64}$/u.test(revision))
    throw invalid("expectedRevision is required.");
  return {
    ...parseCampaignInput(value),
    expectedContentVersion: version,
    expectedRevision: revision,
  };
}

export function parseCampaignCursor(value: unknown): string | undefined {
  return value === undefined ? undefined : uuid(value);
}

function ids(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw invalid("Audience selections must be arrays of at most 1000 IDs.");
  return [...new Set(value.map(uuid))].sort();
}
function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  )
    throw invalid("Invalid UUID.");
  return value.toLowerCase();
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max)
    throw invalid("Invalid text length.");
  return value.trim();
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalid("Expected a JSON object.");
  return value as Record<string, unknown>;
}
function allowKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw invalid("Unknown field.");
}
function invalid(message: string) {
  return new BadRequestException([message]);
}
