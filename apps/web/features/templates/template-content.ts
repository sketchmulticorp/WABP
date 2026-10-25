import type { TemplateRecord, TemplateTextInput } from "./template-api";

export interface TextContent {
  readonly header: string;
  readonly body: string;
  readonly footer: string;
}
/** Reject unknown component keys instead of silently flattening provider content on save. */
export function editableText(template: TemplateRecord): TextContent | null {
  if (!["MARKETING", "UTILITY"].includes(template.category) || !Array.isArray(template.components))
    return null;
  const fields: Record<string, string> = { HEADER: "", BODY: "", FOOTER: "" };
  const seen = new Set<string>();
  for (const component of template.components as readonly unknown[]) {
    if (typeof component !== "object" || component === null || Array.isArray(component))
      return null;
    const value = component as Record<string, unknown>;
    if (
      typeof value.type !== "string" ||
      !["HEADER", "BODY", "FOOTER"].includes(value.type) ||
      seen.has(value.type) ||
      typeof value.text !== "string"
    )
      return null;
    if (
      Object.keys(value).some(
        (key) => !["type", "text", ...(value.type === "HEADER" ? ["format"] : [])].includes(key),
      )
    )
      return null;
    if (value.type === "HEADER" && value.format !== "TEXT") return null;
    fields[value.type] = value.text;
    seen.add(value.type);
  }
  return seen.has("BODY")
    ? { header: fields.HEADER ?? "", body: fields.BODY ?? "", footer: fields.FOOTER ?? "" }
    : null;
}
export function textInput(
  name: string,
  language: string,
  category: string,
  content: TextContent,
): TemplateTextInput {
  return {
    name: name.trim(),
    language: language.trim(),
    category,
    components: [
      ...(content.header ? [{ type: "HEADER", format: "TEXT", text: content.header }] : []),
      { type: "BODY", text: content.body },
      ...(content.footer ? [{ type: "FOOTER", text: content.footer }] : []),
    ],
  };
}
