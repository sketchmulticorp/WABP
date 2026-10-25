import assert from "node:assert/strict";
import test from "node:test";
import type { AutomationGraph, AutomationNode } from "@whatsapp-platform/contracts";
import { parseDraft, parseSimulation } from "./automation.dto.js";
import { automationEnabled } from "./automation-entitlement.policy.js";
import { simulateGraph, validateGraph } from "./automation.validation.js";

const accountId = "00000000-0000-4000-8000-000000000001";
function graph(middle?: AutomationNode): AutomationGraph {
  const nodes: AutomationNode[] = [
    { key: "start", type: "START", config: {} },
    ...(middle === undefined ? [] : [middle]),
    { key: "end", type: "END", config: {} },
  ];
  return {
    accountId,
    keywords: ["hello"],
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      from: nodes[index]?.key ?? "start",
      to: node.key,
      choice: null,
    })),
  };
}

void test("all immediate node types validate and simulation is side-effect-free", () => {
  for (const node of [
    { key: "step", type: "MESSAGE", config: { text: "Welcome" } },
    { key: "step", type: "ASSIGN", config: { userId: accountId } },
    { key: "step", type: "CONTACT_UPDATE", config: { fields: { name: "Visitor" } } },
  ] satisfies AutomationNode[]) {
    const input = graph(node),
      before = JSON.stringify(input);
    assert.deepEqual(validateGraph(input), []);
    assert.equal(simulateGraph(input, []).outcome, "COMPLETED");
    assert.equal(JSON.stringify(input), before);
  }
  const handoff = graph();
  assert.equal(
    simulateGraph(
      {
        ...handoff,
        nodes: handoff.nodes.map((n) => (n.key === "end" ? { ...n, type: "HUMAN_HANDOFF" } : n)),
      },
      [],
    ).outcome,
    "HANDED_OFF",
  );
});

void test("buttons and lists wait for an exact choice and reject unmatched selections", () => {
  for (const type of ["BUTTONS", "LIST"] as const) {
    const input = graph({
      key: "choose",
      type,
      config: {
        text: "Choose",
        choices: [{ id: "yes", title: "Yes" }],
      },
    });
    const branch = {
      ...input,
      edges: input.edges.map((edge) =>
        edge.from === "choose" ? { ...edge, choice: "yes" } : edge,
      ),
    };
    assert.deepEqual(validateGraph(branch), []);
    assert.equal(simulateGraph(branch, []).outcome, "WAITING");
    assert.equal(simulateGraph(branch, ["yes"]).outcome, "COMPLETED");
    assert.equal(simulateGraph(branch, ["other"]).outcome, "INVALID");
  }
});

void test("cycles, unreachable nodes, reserved/duplicate keywords and invalid edges fail closed", () => {
  const input = graph({ key: "step", type: "MESSAGE", config: { text: "Hi" } });
  for (const invalid of [
    { ...input, edges: [...input.edges, { from: "step", to: "step", choice: null }] },
    { ...input, nodes: [...input.nodes, { key: "orphan", type: "END", config: {} } as const] },
    { ...input, keywords: [" STOP "] },
    { ...input, keywords: ["hello", " HELLO "] },
    { ...input, edges: [{ from: "start", to: "missing", choice: null }] },
  ])
    assert.ok(validateGraph(invalid).length > 0);
});

void test("contact updates cannot mutate consent, phone, ownership or deletion", () => {
  for (const field of ["consentStatus", "phone", "tenantId", "is_deleted"]) {
    assert.ok(
      validateGraph(
        graph({
          key: "step",
          type: "CONTACT_UPDATE",
          config: { fields: { [field]: "forbidden" } },
        }),
      ).length > 0,
    );
  }
  assert.ok(
    validateGraph(graph({ key: "step", type: "MESSAGE", config: { text: "x".repeat(4097) } }))
      .length > 0,
  );
});

void test("draft parser rejects injected fields and stale revision formats; normalizes keywords", () => {
  const input = { name: " Welcome ", graph: { ...graph(), keywords: [" HELLO ", "hello"] } };
  assert.deepEqual(parseDraft(input, false).graph.keywords, ["hello"]);
  assert.equal(parseDraft(input, false).name, "Welcome");
  for (const extra of [{ tenantId: accountId }, { status: "ACTIVE" }, { publishedBy: accountId }])
    assert.throws(() => parseDraft({ ...input, ...extra }, false));
  assert.throws(() => parseDraft({ ...input, expectedRevision: "old" }, true));
  assert.throws(() =>
    parseSimulation({ expectedRevision: "a".repeat(64), selections: ["bad id"] }),
  );
  assert.deepEqual(
    parseSimulation({ expectedRevision: "a".repeat(64), selections: ["yes"] }).selections,
    ["yes"],
  );
});

void test("plan entitlement accepts only explicit true on an eligible active plan", () => {
  assert.equal(automationEnabled(undefined), false);
  for (const status of ["ACTIVE", "TRIAL"])
    assert.equal(
      automationEnabled({ status, planStatus: "ACTIVE", flags: { automation_enabled: true } }),
      true,
    );
  for (const flag of [false, "true", 1, null, undefined])
    assert.equal(
      automationEnabled({
        status: "ACTIVE",
        planStatus: "ACTIVE",
        flags: { automation_enabled: flag },
      }),
      false,
    );
  assert.equal(
    automationEnabled({
      status: "SUSPENDED",
      planStatus: "ACTIVE",
      flags: { automation_enabled: true },
    }),
    false,
  );
  assert.equal(
    automationEnabled({
      status: "ACTIVE",
      planStatus: "INACTIVE",
      flags: { automation_enabled: true },
    }),
    false,
  );
});
