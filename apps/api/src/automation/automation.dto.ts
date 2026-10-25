import type {
  AutomationDraftInput,
  AutomationEdge,
  AutomationGraph,
  AutomationNode,
} from "@whatsapp-platform/contracts";
import { ApplicationError } from "../common/errors/application-error.js";
import {
  AUTOMATION_NODE_TYPES,
  keyPattern,
  keyword,
  record,
  uuidPattern,
} from "./automation.validation.js";

export function automationInvalid(message: string): never {
  throw new ApplicationError({ code: "AUTOMATION_VALIDATION_FAILED", message, statusCode: 400 });
}
export function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!record(value) || Object.keys(value).some((key) => !allowed.includes(key)))
    automationInvalid("Unexpected automation fields.");
  return value;
}
export function revision(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value))
    automationInvalid("Reload the saved automation revision.");
  return value;
}
export function parseDraft(
  value: unknown,
  editing: boolean,
): AutomationDraftInput & { expectedRevision: string | null } {
  const body = object(value, editing ? ["name", "graph", "expectedRevision"] : ["name", "graph"]);
  if (
    typeof body.name !== "string" ||
    body.name.trim().length === 0 ||
    body.name.trim().length > 120
  )
    automationInvalid("Name must contain 1–120 characters.");
  const raw = object(body.graph, ["accountId", "keywords", "nodes", "edges"]);
  if (typeof raw.accountId !== "string" || !uuidPattern.test(raw.accountId))
    automationInvalid("Choose a valid account.");
  if (
    !Array.isArray(raw.keywords) ||
    raw.keywords.length > 20 ||
    raw.keywords.some((k) => typeof k !== "string" || k.trim().length === 0 || k.length > 120)
  )
    automationInvalid("Invalid keyword list.");
  if (
    !Array.isArray(raw.nodes) ||
    raw.nodes.length > 30 ||
    !Array.isArray(raw.edges) ||
    raw.edges.length > 300
  )
    automationInvalid("Use at most 30 nodes and 300 transitions.");
  const nodes: AutomationNode[] = raw.nodes.map((value) => {
    const node = object(value, ["key", "type", "config"]);
    if (
      typeof node.key !== "string" ||
      !keyPattern.test(node.key) ||
      !AUTOMATION_NODE_TYPES.some((t) => t === node.type) ||
      !record(node.config) ||
      JSON.stringify(node.config).length > 16384
    )
      automationInvalid("Invalid automation node.");
    return { key: node.key, type: node.type as AutomationNode["type"], config: node.config };
  });
  if (new Set(nodes.map((n) => n.key)).size !== nodes.length)
    automationInvalid("Node keys must be unique.");
  const edges: AutomationEdge[] = raw.edges.map((value) => {
    const edge = object(value, ["from", "to", "choice"]);
    if (
      typeof edge.from !== "string" ||
      typeof edge.to !== "string" ||
      !nodes.some((n) => n.key === edge.from) ||
      !nodes.some((n) => n.key === edge.to) ||
      !(edge.choice === null || (typeof edge.choice === "string" && keyPattern.test(edge.choice)))
    )
      automationInvalid("Invalid transition.");
    return { from: edge.from, to: edge.to, choice: edge.choice };
  });
  if (new Set(edges.map((e) => JSON.stringify(e))).size !== edges.length)
    automationInvalid("Transitions must be unique.");
  const graph: AutomationGraph = {
    accountId: raw.accountId,
    keywords: [...new Set((raw.keywords as string[]).map(keyword))],
    nodes,
    edges,
  };
  return {
    name: body.name.trim(),
    graph,
    expectedRevision: editing ? revision(body.expectedRevision) : null,
  };
}
export function parseSimulation(value: unknown) {
  const body = object(value, ["expectedRevision", "selections"]);
  if (
    !Array.isArray(body.selections) ||
    body.selections.length > 30 ||
    body.selections.some((c) => typeof c !== "string" || !keyPattern.test(c))
  )
    automationInvalid("Invalid simulator selections.");
  return {
    expectedRevision: revision(body.expectedRevision),
    selections: body.selections as string[],
  };
}
