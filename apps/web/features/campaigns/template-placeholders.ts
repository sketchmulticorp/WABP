/** Authoring hints only; the server remains authoritative for supported components and keys. */
export function templatePlaceholders(components: unknown): readonly string[] {
  if (!Array.isArray(components)) return [];
  const keys = new Set<string>();
  for (const value of components as readonly unknown[]) {
    if (typeof value !== "object" || value === null) continue;
    const component = value as Record<string, unknown>;
    if (
      typeof component.type !== "string" ||
      !["BODY", "HEADER"].includes(component.type.toUpperCase()) ||
      typeof component.text !== "string"
    )
      continue;
    for (const match of component.text.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*|\d+)\s*\}\}/gu)) {
      if (match[1]) keys.add(match[1]);
    }
  }
  return [...keys].slice(0, 100);
}
