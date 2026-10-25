"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AutomationDetail,
  AutomationOptions,
  AutomationSimulation,
  AutomationSummary,
  CurrentUserResponse,
} from "@whatsapp-platform/contracts";
import { automationApi } from "./automation-api";
import { AutomationEditor, readChoices } from "./automation-editor";
import { ApiClientError } from "../workspace/api-client";

/** Tenant automation workspace: authoring and no-send simulation, separate from background execution. */
export function AutomationScreen({ user }: { readonly user: CurrentUserResponse }) {
  const [page, setPage] = useState<{
    automations: AutomationSummary[];
    nextCursor: string | null;
  } | null>(null);
  const [options, setOptions] = useState<AutomationOptions | null>(null),
    [flow, setFlow] = useState<AutomationDetail | null>(null);
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<AutomationSimulation | null>(null),
    [selections, setSelections] = useState<readonly string[]>([]);
  const [reload, setReload] = useState(0);
  const generation = useRef({ version: 0 });
  const clearProtected = useCallback(() => {
    setPage(null);
    setOptions(null);
    setFlow(null);
    setEditing(false);
    setSimulation(null);
    setSelections([]);
  }, []);
  const canWrite = user.permissions.includes("automation.write"),
    canTest = user.permissions.includes("automation.test");
  const canPublish =
    user.role.system_key === "TENANT_ADMIN" && user.permissions.includes("automation.publish");
  const allowed =
    user.role.system_key !== "SUPER_ADMIN" && user.permissions.includes("automation.read");
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const lifecycle = generation.current;
    void Promise.all([
      automationApi.list(undefined, controller.signal),
      automationApi.options(undefined, undefined, controller.signal),
    ])
      .then(([list, choices]) => {
        if (!controller.signal.aborted) {
          setPage(list);
          setOptions(choices);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          if (authError(reason)) clearProtected();
          setError(message(reason));
        }
      });
    return () => {
      controller.abort();
      lifecycle.version++;
    };
  }, [allowed, reload, clearProtected]);
  if (!allowed) return <p role="alert">You do not have permission to view automations.</p>;
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    const token = ++generation.current.version;
    try {
      await work();
    } catch (reason) {
      if (token === generation.current.version) {
        if (authError(reason)) clearProtected();
        setError(message(reason));
      }
    } finally {
      if (token === generation.current.version) setBusy(false);
    }
  }
  async function open(id: string) {
    await action(async () => {
      const loaded = await automationApi.read(id);
      setFlow(loaded);
      setEditing(false);
      setSimulation(null);
      setSelections([]);
    });
  }
  const version =
    flow?.versions.find((v) => v.status === "DRAFT") ??
    flow?.versions.find((v) => v.id === flow.publishedVersionId);
  const waiting =
    simulation?.outcome === "WAITING"
      ? version?.graph.nodes.find((n) => n.key === simulation.steps.at(-1)?.key)
      : undefined;
  return (
    <section aria-labelledby="automation-title" className="automation-screen">
      <h2 id="automation-title">Basic automations</h2>
      <p>Account-specific keyword flows. Draft simulation never sends a WhatsApp message.</p>
      {error !== null && (
        <p role="alert">
          {error}{" "}
          <button
            disabled={busy}
            type="button"
            onClick={() => {
              setError(null);
              setReload((n) => n + 1);
            }}
          >
            Retry list/options
          </button>
        </p>
      )}
      {page === null || options === null ? (
        <p role="status">
          {error === null
            ? "Loading automations…"
            : "Automation data is unavailable. Retry or sign in again if access changed."}
        </p>
      ) : (
        <>
          {page.automations.length === 0 && <p>No automations yet.</p>}
          <ul>
            {page.automations.map((f) => (
              <li key={f.id}>
                <button type="button" disabled={busy || editing} onClick={() => void open(f.id)}>
                  {f.name} · {f.status}
                </button>
              </li>
            ))}
          </ul>
          {page.nextCursor !== null && (
            <button
              type="button"
              disabled={busy || editing}
              onClick={() =>
                void action(async () => {
                  const next = await automationApi.list(page.nextCursor ?? undefined);
                  setPage({
                    automations: [...page.automations, ...next.automations],
                    nextCursor: next.nextCursor,
                  });
                })
              }
            >
              Load more flows
            </button>
          )}
          {canWrite && (
            <button
              type="button"
              disabled={busy || editing || options.accounts.length === 0}
              onClick={() => {
                setFlow(null);
                setEditing(true);
                setSimulation(null);
              }}
            >
              Create automation
            </button>
          )}
          {options.accounts.length === 0 && (
            <p>Connect a WhatsApp account before creating an automation.</p>
          )}
          {(options.accountCursor !== null || options.memberCursor !== null) && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const next = await automationApi.options(
                    options.accountCursor ?? undefined,
                    options.memberCursor ?? undefined,
                  );
                  setOptions({
                    accounts: unique([...options.accounts, ...next.accounts]),
                    members: unique([...options.members, ...next.members]),
                    accountCursor: options.accountCursor === null ? null : next.accountCursor,
                    memberCursor: options.memberCursor === null ? null : next.memberCursor,
                  });
                })
              }
            >
              Load more accounts/team members
            </button>
          )}
          {editing ? (
            <AutomationEditor
              key={flow?.revision ?? "new"}
              existing={flow}
              options={options}
              busy={busy}
              onCancel={() => {
                setEditing(false);
              }}
              onSave={(input) =>
                void action(async () => {
                  const saved = await automationApi.save(input, flow);
                  setFlow(saved);
                  setEditing(false);
                  setSimulation(null);
                  setSelections([]);
                  setPage(await automationApi.list());
                })
              }
            />
          ) : (
            flow !== null && (
              <article aria-label="Selected automation">
                <h3>
                  {flow.name} · {flow.status}
                </h3>
                {canPublish && flow.publishedVersionId !== null && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const command = flow.status === "ACTIVE" ? "pause" : "reactivate";
                      if (
                        window.confirm(
                          command === "pause"
                            ? "Pause new and active execution? Reactivation will not resume old runs."
                            : "Enable new keyword-triggered runs only? Old runs remain stopped.",
                        )
                      )
                        void action(async () => {
                          setFlow(await automationApi.command(flow, command));
                          setPage(await automationApi.list());
                        });
                    }}
                  >
                    {flow.status === "ACTIVE" ? "Pause automation" : "Reactivate for new runs"}
                  </button>
                )}
                <div className="inbox-actions">
                  <button type="button" disabled={busy} onClick={() => void open(flow.id)}>
                    Reload saved version
                  </button>
                  {canWrite && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(true);
                      }}
                    >
                      Edit draft
                    </button>
                  )}
                  {canPublish && flow.versions.some((v) => v.status === "DRAFT") && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Publish this saved version and enable new customer-triggered runs?",
                          )
                        )
                          void action(async () => {
                            setFlow(await automationApi.publish(flow));
                            setPage(await automationApi.list());
                            setSimulation(null);
                          });
                      }}
                    >
                      Publish saved draft
                    </button>
                  )}
                </div>
                <h4>Version history</h4>
                <ul>
                  {flow.versions.map((v) => (
                    <li key={v.id}>
                      Version {v.number} · {v.status}
                      {v.id === flow.publishedVersionId ? " · Current publication" : ""}
                      <details>
                        <summary>Read-only steps</summary>
                        <ol>
                          {v.graph.nodes.map((n) => (
                            <li key={n.key}>
                              {n.key} · {n.type}
                              {typeof n.config.text === "string" && (
                                <p className="automation-preview-text">{n.config.text}</p>
                              )}
                              {readChoices(n).length > 0 && (
                                <ul>
                                  {readChoices(n).map((choice) => (
                                    <li key={choice.id}>{choice.title}</li>
                                  ))}
                                </ul>
                              )}
                              {n.type === "ASSIGN" && (
                                <p>
                                  Assign:{" "}
                                  {options.members.find((m) => m.id === n.config.userId)?.label ??
                                    "Saved team member (not in loaded options)"}
                                </p>
                              )}
                              {n.type === "CONTACT_UPDATE" &&
                                typeof n.config.fields === "object" &&
                                n.config.fields !== null && (
                                  <ul>
                                    {Object.entries(n.config.fields)
                                      .filter(
                                        ([key, value]) =>
                                          ["name", "email", "company", "address"].includes(key) &&
                                          typeof value === "string",
                                      )
                                      .map(([key, value]) => (
                                        <li key={key}>
                                          {key}: {String(value)}
                                        </li>
                                      ))}
                                  </ul>
                                )}
                            </li>
                          ))}
                        </ol>
                        <ul>
                          {v.graph.edges.map((e, i) => (
                            <li key={i}>
                              {e.from} → {e.to}
                              {e.choice === null ? "" : ` (${e.choice})`}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
                {canTest && (
                  <section aria-label="No-send simulator">
                    <h4>Simulate saved draft/current publication</h4>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          setSelections([]);
                          setSimulation(await automationApi.simulate(flow, []));
                        })
                      }
                    >
                      Start simulation
                    </button>
                    {simulation !== null && (
                      <>
                        <p role="status">{simulation.outcome} — no messages sent.</p>
                        {simulation.errors.map((e) => (
                          <p role="alert" key={e}>
                            {e}
                          </p>
                        ))}
                        <ol>
                          {simulation.steps.map((s) => (
                            <li key={s.key}>
                              {s.key} · {s.type}
                            </li>
                          ))}
                        </ol>
                        {waiting !== undefined &&
                          readChoices(waiting).map((c) => (
                            <button
                              type="button"
                              disabled={busy}
                              key={c.id}
                              onClick={() =>
                                void action(async () => {
                                  const next = [...selections, c.id];
                                  setSimulation(await automationApi.simulate(flow, next));
                                  setSelections(next);
                                })
                              }
                            >
                              {c.title}
                            </button>
                          ))}
                      </>
                    )}
                  </section>
                )}
              </article>
            )
          )}
        </>
      )}
    </section>
  );
}
function message(value: unknown) {
  return value instanceof Error ? value.message : "Automation action failed.";
}
function authError(value: unknown) {
  return value instanceof ApiClientError && [401, 403].includes(value.status);
}
function unique<T extends { readonly id: string }>(rows: readonly T[]): T[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}
