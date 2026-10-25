import type {
  AutomationGraph,
  AutomationNode,
  AutomationSimulation,
} from "@whatsapp-platform/contracts";

export const AUTOMATION_NODE_TYPES = [
  "START",
  "MESSAGE",
  "BUTTONS",
  "LIST",
  "ASSIGN",
  "CONTACT_UPDATE",
  "HUMAN_HANDOFF",
  "END",
] as const;
export const AUTOMATION_NODE_LIMIT = 30;
export const AUTOMATION_JOB_STEP_LIMIT = 10;
export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const keyPattern = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/u;
export const optOutKeywords = new Set(["stop", "unsubscribe", "cancel", "end", "quit"]);
export function keyword(value: string) {
  return value.trim().toLowerCase();
}
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}
function only(config: Readonly<Record<string, unknown>>, keys: readonly string[]) {
  return Object.keys(config).every((key) => keys.includes(key));
}
export interface Choice {
  readonly id: string;
  readonly title: string;
}
export function choices(node: AutomationNode): readonly Choice[] {
  const raw = node.config.choices;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (value): value is Choice =>
      record(value) && typeof value.id === "string" && typeof value.title === "string",
  );
}

/** Pure graph validation, shared by publication and simulation. No database or provider effects. */
export function validateGraph(graph: AutomationGraph): string[] {
  const errors: string[] = [];
  if (!uuidPattern.test(graph.accountId)) errors.push("Choose a WhatsApp account.");
  if (graph.nodes.length < 2 || graph.nodes.length > AUTOMATION_NODE_LIMIT)
    errors.push("Use 2–30 nodes.");
  if (
    graph.keywords.length < 1 ||
    graph.keywords.length > 20 ||
    graph.keywords.some((k) => !text(k, 120) || optOutKeywords.has(keyword(k))) ||
    new Set(graph.keywords.map(keyword)).size !== graph.keywords.length
  )
    errors.push("Use 1–20 unique whole-message keywords; opt-out keywords are reserved.");
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  if (byKey.size !== graph.nodes.length || graph.nodes.some((n) => !keyPattern.test(n.key)))
    errors.push("Node keys must be unique and valid.");
  const starts = graph.nodes.filter((n) => n.type === "START");
  if (starts.length !== 1) errors.push("Exactly one START is required.");
  for (const node of graph.nodes) {
    const config = node.config;
    let valid = true;
    switch (node.type) {
      case "START":
      case "HUMAN_HANDOFF":
      case "END":
        valid = only(config, []);
        break;
      case "MESSAGE":
        valid = only(config, ["text"]) && text(config.text, 4096);
        break;
      case "BUTTONS":
      case "LIST": {
        const options = choices(node);
        valid =
          only(config, ["text", "choices"]) &&
          text(config.text, 1024) &&
          Array.isArray(config.choices) &&
          options.length === config.choices.length &&
          options.length >= 1 &&
          options.length <= (node.type === "BUTTONS" ? 3 : 10) &&
          new Set(options.map((c) => c.id)).size === options.length &&
          new Set(options.map((c) => c.title.trim())).size === options.length &&
          options.every(
            (c) => keyPattern.test(c.id) && text(c.title, node.type === "BUTTONS" ? 20 : 24),
          ) &&
          config.choices.every((c) => record(c) && only(c, ["id", "title"]));
        break;
      }
      case "ASSIGN":
        valid =
          only(config, ["userId"]) &&
          typeof config.userId === "string" &&
          uuidPattern.test(config.userId);
        break;
      case "CONTACT_UPDATE": {
        const fields = config.fields;
        valid =
          only(config, ["fields"]) &&
          record(fields) &&
          Object.keys(fields).length > 0 &&
          only(fields, ["name", "email", "company", "address"]) &&
          Object.entries(fields).every(
            ([key, value]) =>
              text(value, key === "address" ? 1000 : key === "email" ? 320 : 256) &&
              (key !== "email" ||
                (typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value))),
          );
        break;
      }
    }
    if (!valid) errors.push(`Invalid configuration for ${node.key}.`);
    const edges = graph.edges.filter((e) => e.from === node.key);
    if (node.type === "END" || node.type === "HUMAN_HANDOFF") {
      if (edges.length !== 0) errors.push(`${node.key} must have no next step.`);
    } else if (node.type === "BUTTONS" || node.type === "LIST") {
      const options = choices(node);
      if (
        edges.length !== options.length ||
        options.some((c) => edges.filter((e) => e.choice === c.id).length !== 1)
      )
        errors.push(`Connect every choice of ${node.key} exactly once.`);
    } else if (edges.length !== 1 || edges[0]?.choice !== null)
      errors.push(`${node.key} requires exactly one next step.`);
  }
  if (
    graph.edges.some(
      (e) => !byKey.has(e.from) || !byKey.has(e.to) || byKey.get(e.to)?.type === "START",
    )
  )
    errors.push("Every transition must target a valid non-START node.");
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(key: string) {
    if (visiting.has(key)) {
      errors.push("Cycles are not supported.");
      return;
    }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const edge of graph.edges.filter((e) => e.from === key))
      if (byKey.has(edge.to)) visit(edge.to);
    visiting.delete(key);
    visited.add(key);
  }
  const start = starts[0];
  if (start !== undefined) visit(start.key);
  if (visited.size !== graph.nodes.length) errors.push("All nodes must be reachable from START.");
  return [...new Set(errors)];
}

export function simulateGraph(
  graph: AutomationGraph,
  selections: readonly string[],
): AutomationSimulation {
  const errors = validateGraph(graph),
    steps: { key: string; type: AutomationNode["type"] }[] = [];
  if (errors.length > 0) return { valid: false, errors, steps, outcome: "INVALID" };
  let current = graph.nodes.find((n) => n.type === "START"),
    index = 0;
  while (current !== undefined && steps.length <= AUTOMATION_NODE_LIMIT) {
    steps.push({ key: current.key, type: current.type });
    if (current.type === "END") return { valid: true, errors, steps, outcome: "COMPLETED" };
    if (current.type === "HUMAN_HANDOFF")
      return { valid: true, errors, steps, outcome: "HANDED_OFF" };
    const choice =
      current.type === "BUTTONS" || current.type === "LIST" ? selections[index++] : null;
    if (choice === undefined) return { valid: true, errors, steps, outcome: "WAITING" };
    const next = graph.edges.find((e) => e.from === current?.key && e.choice === choice);
    if (next === undefined)
      return {
        valid: false,
        errors: ["Simulation choice does not match the current step."],
        steps,
        outcome: "INVALID",
      };
    current = graph.nodes.find((n) => n.key === next.to);
  }
  return { valid: false, errors: ["Invalid simulation path."], steps, outcome: "INVALID" };
}
