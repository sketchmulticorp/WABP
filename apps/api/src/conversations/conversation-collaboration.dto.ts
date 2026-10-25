import { BadRequestException } from "@nestjs/common";

export interface CreateConversationNoteInput {
  readonly id: string;
  readonly note: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseConversationAssignment(value: unknown): string | null {
  const body = object(value, ["assignedUserId"]);
  if (body.assignedUserId === null) return null;
  if (typeof body.assignedUserId !== "string" || !uuid.test(body.assignedUserId)) throw invalid();
  return body.assignedUserId.toLowerCase();
}
export function parseConversationNote(value: unknown): CreateConversationNoteInput {
  const body = object(value, ["id", "note"]);
  if (typeof body.id !== "string" || !uuid.test(body.id) || typeof body.note !== "string")
    throw invalid();
  const note = body.note.trim();
  if (note.length === 0 || note.length > 4000) throw invalid();
  return { id: body.id.toLowerCase(), note };
}
function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw invalid();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw invalid();
  return body;
}
function invalid() {
  return new BadRequestException("Invalid conversation collaboration request.");
}
