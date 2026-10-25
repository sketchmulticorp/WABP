"use client";
import { useState, type SyntheticEvent } from "react";
import type {
  AutomationDetail,
  AutomationDraftInput,
  AutomationEdge,
  AutomationNode,
  AutomationNodeType,
  AutomationOptions,
} from "@whatsapp-platform/contracts";

const types: readonly AutomationNodeType[] = [
  "START",
  "MESSAGE",
  "BUTTONS",
  "LIST",
  "ASSIGN",
  "CONTACT_UPDATE",
  "HUMAN_HANDOFF",
  "END",
];
const initial: readonly AutomationNode[] = [
  { key: "start", type: "START", config: {} },
  { key: "message", type: "MESSAGE", config: { text: "How can we help?" } },
  { key: "handoff", type: "HUMAN_HANDOFF", config: {} },
];

/** Form-based graph authoring. Incomplete configurations may be saved, never published implicitly. */
export function AutomationEditor({
  existing,
  options,
  busy,
  onSave,
  onCancel,
}: {
  readonly existing: AutomationDetail | null;
  readonly options: AutomationOptions;
  readonly busy: boolean;
  readonly onSave: (input: AutomationDraftInput) => void;
  readonly onCancel: () => void;
}) {
  const version =
    existing?.versions.find((v) => v.status === "DRAFT") ??
    existing?.versions.find((v) => v.id === existing.publishedVersionId);
  const [name, setName] = useState(existing?.name ?? ""),
    [accountId, setAccountId] = useState(version?.graph.accountId ?? "");
  const [keywords, setKeywords] = useState(version?.graph.keywords.join("\n") ?? "");
  const [nodes, setNodes] = useState<readonly AutomationNode[]>(version?.graph.nodes ?? initial);
  const [edges, setEdges] = useState<readonly AutomationEdge[]>(
    version?.graph.edges ?? [
      { from: "start", to: "message", choice: null },
      { from: "message", to: "handoff", choice: null },
    ],
  );
  function update(key: string, config: Readonly<Record<string, unknown>>) {
    setNodes(nodes.map((n) => (n.key === key ? { ...n, config } : n)));
  }
  function next(from: string, choice: string | null, to: string) {
    setEdges([
      ...edges.filter((e) => !(e.from === from && e.choice === choice)),
      ...(to === "" ? [] : [{ from, choice, to }]),
    ]);
  }
  function remove(key: string) {
    setNodes(nodes.filter((n) => n.key !== key));
    setEdges(edges.filter((e) => e.from !== key && e.to !== key));
  }
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      name,
      graph: {
        accountId,
        keywords: keywords
          .split("\n")
          .map((k) => k.trim())
          .filter(Boolean),
        nodes,
        edges,
      },
    });
  }
  return (
    <form onSubmit={submit} aria-label="Automation draft editor">
      <h3>{existing === null ? "Create automation" : "Edit a new draft"}</h3>
      <p>
        Published versions and existing runs are unchanged until an Admin publishes this saved
        draft.
      </p>
      <fieldset disabled={busy}>
        <legend>Flow settings</legend>
        <label>
          Name
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
        <label>
          WhatsApp account
          <select
            required
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
            }}
          >
            <option value="">Choose account</option>
            {accountId !== "" && !options.accounts.some((a) => a.id === accountId) && (
              <option value={accountId}>Saved account (not in loaded options)</option>
            )}
            {options.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Trigger keywords (one whole message per line)
          <textarea
            required
            value={keywords}
            onChange={(e) => {
              setKeywords(e.target.value);
            }}
          />
        </label>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Steps and transitions ({nodes.length}/30)</legend>
        {nodes.map((node, index) => (
          <section
            key={node.key}
            className="automation-step"
            aria-label={`Step ${String(index + 1)}`}
          >
            <h4>
              {node.key} · {node.type}
            </h4>
            <label>
              Step type
              <select
                value={node.type}
                onChange={(e) => {
                  setNodes(
                    nodes.map((n) =>
                      n.key === node.key
                        ? { ...n, type: e.target.value as AutomationNodeType, config: {} }
                        : n,
                    ),
                  );
                  setEdges(edges.filter((edge) => edge.from !== node.key));
                }}
              >
                {types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            {["MESSAGE", "BUTTONS", "LIST"].includes(node.type) && (
              <label>
                Customer message
                <textarea
                  maxLength={node.type === "MESSAGE" ? 4096 : 1024}
                  value={typeof node.config.text === "string" ? node.config.text : ""}
                  onChange={(e) => {
                    update(node.key, { ...node.config, text: e.target.value });
                  }}
                />
              </label>
            )}
            {node.type === "ASSIGN" && (
              <label>
                Assign team member
                <select
                  value={typeof node.config.userId === "string" ? node.config.userId : ""}
                  onChange={(e) => {
                    update(node.key, { userId: e.target.value });
                  }}
                >
                  <option value="">Choose team member</option>
                  {options.members.map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {node.type === "CONTACT_UPDATE" && (
              <fieldset>
                <legend>Literal contact updates (blank means unchanged)</legend>
                {["name", "email", "company", "address"].map((field) => (
                  <label key={field}>
                    {field}
                    <input
                      type={field === "email" ? "email" : "text"}
                      maxLength={field === "address" ? 1000 : field === "email" ? 320 : 256}
                      value={fieldValue(node, field)}
                      onChange={(e) => {
                        const fields = { ...readFields(node), [field]: e.target.value };
                        update(node.key, {
                          fields: Object.fromEntries(
                            Object.entries(fields).filter(([, value]) => value !== ""),
                          ),
                        });
                      }}
                    />
                  </label>
                ))}
              </fieldset>
            )}
            {(node.type === "BUTTONS" || node.type === "LIST") && (
              <fieldset>
                <legend>Choices</legend>
                {readChoices(node).map((choice, i) => (
                  <div key={i}>
                    <label>
                      Choice {i + 1} title
                      <input
                        maxLength={node.type === "BUTTONS" ? 20 : 24}
                        value={choice.title}
                        onChange={(e) => {
                          update(node.key, {
                            ...node.config,
                            choices: readChoices(node).map((c, j) =>
                              j === i ? { ...c, title: e.target.value } : c,
                            ),
                          });
                        }}
                      />
                    </label>
                    <NextStep
                      nodes={nodes}
                      node={node}
                      choice={choice.id}
                      edges={edges}
                      onChange={(to) => {
                        next(node.key, choice.id, to);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        update(node.key, {
                          ...node.config,
                          choices: readChoices(node).filter((_, j) => j !== i),
                        });
                        setEdges(
                          edges.filter((e) => !(e.from === node.key && e.choice === choice.id)),
                        );
                      }}
                    >
                      Remove choice {i + 1}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={readChoices(node).length >= (node.type === "BUTTONS" ? 3 : 10)}
                  onClick={() => {
                    update(node.key, {
                      ...node.config,
                      choices: [
                        ...readChoices(node),
                        { id: `c_${crypto.randomUUID().slice(0, 8)}`, title: "" },
                      ],
                    });
                  }}
                >
                  Add choice
                </button>
              </fieldset>
            )}
            {!["BUTTONS", "LIST", "END", "HUMAN_HANDOFF"].includes(node.type) && (
              <NextStep
                nodes={nodes}
                node={node}
                choice={null}
                edges={edges}
                onChange={(to) => {
                  next(node.key, null, to);
                }}
              />
            )}
            <button
              type="button"
              onClick={() => {
                remove(node.key);
              }}
            >
              Remove step
            </button>
          </section>
        ))}
        <button
          type="button"
          disabled={nodes.length >= 30}
          onClick={() => {
            setNodes([
              ...nodes,
              {
                key: `step_${crypto.randomUUID().slice(0, 8)}`,
                type: "MESSAGE",
                config: { text: "" },
              },
            ]);
          }}
        >
          Add step
        </button>
      </fieldset>
      <h3>Readable transition preview</h3>
      <ul>
        {edges.map((e, i) => (
          <li key={i}>
            {e.from} → {e.to}
            {e.choice === null ? "" : ` (choice ${e.choice})`}
          </li>
        ))}
      </ul>
      <button disabled={busy} type="submit">
        {busy ? "Saving…" : "Save draft"}
      </button>{" "}
      <button disabled={busy} type="button" onClick={onCancel}>
        Cancel editing
      </button>
    </form>
  );
}
function NextStep({
  nodes,
  node,
  choice,
  edges,
  onChange,
}: {
  readonly nodes: readonly AutomationNode[];
  readonly node: AutomationNode;
  readonly choice: string | null;
  readonly edges: readonly AutomationEdge[];
  readonly onChange: (value: string) => void;
}) {
  return (
    <label>
      Next step{choice === null ? "" : ` for ${choice}`}
      <select
        value={edges.find((e) => e.from === node.key && e.choice === choice)?.to ?? ""}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        <option value="">Not connected</option>
        {nodes
          .filter((n) => n.key !== node.key && n.type !== "START")
          .map((n) => (
            <option value={n.key} key={n.key}>
              {n.key} · {n.type}
            </option>
          ))}
      </select>
    </label>
  );
}
export function readChoices(node: AutomationNode): { id: string; title: string }[] {
  const value = node.config.choices;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c: unknown): c is { id: string; title: string } =>
      typeof c === "object" &&
      c !== null &&
      "id" in c &&
      "title" in c &&
      typeof c.id === "string" &&
      typeof c.title === "string",
  );
}
function readFields(node: AutomationNode): Record<string, string> {
  const fields = node.config.fields;
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) return {};
  return Object.fromEntries(
    Object.entries(fields).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
function fieldValue(node: AutomationNode, key: string) {
  return readFields(node)[key] ?? "";
}
