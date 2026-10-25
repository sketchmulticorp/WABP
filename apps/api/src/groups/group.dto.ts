import { BadRequestException } from "@nestjs/common";

export interface CreateGroupInput {
  readonly name: string;
}

export interface UpdateGroupInput {
  readonly name: string;
}

export interface GroupMembersInput {
  readonly contactIds: readonly string[];
}

export function parseCreateGroupInput(value: unknown): CreateGroupInput {
  return { name: name(object(value).name) };
}

export function parseUpdateGroupInput(value: unknown): UpdateGroupInput {
  return { name: name(object(value).name) };
}

export function parseGroupMembersInput(value: unknown): GroupMembersInput {
  const contactIds = object(value).contact_ids;
  if (!Array.isArray(contactIds) || contactIds.length === 0 || contactIds.length > 100) {
    throw invalid("contact_ids must contain between 1 and 100 contact IDs");
  }
  const unique = [...new Set(contactIds.map(uuid))];
  return { contactIds: unique };
}

function name(value: unknown): string {
  if (typeof value !== "string") throw invalid("group name is required");
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length < 1 || normalized.length > 120) {
    throw invalid("group name must contain between 1 and 120 characters");
  }
  return normalized;
}

function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  ) {
    throw invalid("contact_ids must contain UUIDs");
  }
  return value;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid("value must be an object");
  }
  return value as Record<string, unknown>;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException([message]);
}
