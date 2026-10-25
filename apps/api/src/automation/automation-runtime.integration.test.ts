import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import {
  withAutomationDatabase,
  automationFixture,
  linearGraph,
} from "./automation.test-fixture.js";
import { choiceToken } from "./automation-trigger.service.js";

void test(
  "concurrent saves/publications reject stale revisions and ambiguous active keywords",
  { timeout: 60000 },
  async () =>
    withAutomationDatabase(async (database) => {
      const f = await automationFixture(database),
        graph = linearGraph(f.accountId, []);
      const draft = await f.authoring.save(
        f.context,
        null,
        { name: "Concurrent edits", graph },
        null,
      );
      const edits = await Promise.allSettled(
        ["First edit", "Second edit"].map((name) =>
          f.authoring.save(f.context, draft.id, { name, graph }, draft.revision),
        ),
      );
      assert.equal(edits.filter((result) => result.status === "fulfilled").length, 1);
      for (const result of edits)
        if (result.status === "rejected")
          assert.ok(
            result.reason instanceof Error &&
              "code" in result.reason &&
              result.reason.code === "AUTOMATION_REVISION_CHANGED",
          );
      const current = await f.authoring.read(f.context, draft.id);
      const publications = await Promise.allSettled(
        Array.from({ length: 4 }, () => f.authoring.publish(f.context, draft.id, current.revision)),
      );
      assert.equal(publications.filter((result) => result.status === "fulfilled").length, 1);
      const other = await f.authoring.save(
        f.context,
        null,
        { name: "Conflicting keyword", graph },
        null,
      );
      await assert.rejects(
        f.authoring.publish(f.context, other.id, other.revision),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "AUTOMATION_KEYWORD_EXISTS",
      );
      const history = await f.authoring.read(f.context, draft.id);
      assert.equal(history.versions.filter((v) => v.status === "PUBLISHED").length, 1);
    }),
);

void test(
  "LIST waiting expires on its original deadline; unexpected text and STOP hand off silently",
  { timeout: 60000 },
  async () =>
    withAutomationDatabase(async (database) => {
      for (const action of ["expiry", "unexpected", "stop"] as const) {
        const f = await automationFixture(database);
        const graph = linearGraph(f.accountId, [
          {
            key: "list",
            type: "LIST",
            config: { text: "Select", choices: [{ id: "yes", title: "Yes" }] },
          },
        ]);
        await f.publish({
          ...graph,
          edges: graph.edges.map((edge) =>
            edge.from === "list" ? { ...edge, choice: "yes" } : edge,
          ),
        });
        await f.trigger.inbound(await f.inbound("hello"));
        let run = await f.current();
        assert.ok(run);
        await f.advance(run.id);
        run = await f.current();
        assert.equal(run?.status, "WAITING");
        assert.ok(run);
        if (action === "expiry") {
          await database.execute(
            sql`UPDATE app.automation_runs SET state=jsonb_set(state,'{expiresAt}',to_jsonb((now()-interval '1 second')::text)) WHERE id=${run.id}::uuid`,
          );
          await f.advance(run.id);
        } else {
          await f.trigger.inbound(await f.inbound(action === "stop" ? "STOP" : "I need a person"));
        }
        const stored = await database.transaction((tx) => f.runs.find(tx, f.tenantId, run.id));
        assert.equal(stored?.status, action === "expiry" ? "CANCELLED" : "HANDED_OFF");
        const count = await database.execute<{ count: number }>(
          sql`SELECT count(*)::int AS count FROM app.messages WHERE tenant_id=${f.tenantId}::uuid AND direction='OUTBOUND'`,
        );
        assert.equal(count.rows[0]?.count, 1);
      }
    }),
);

void test(
  "pending SENDING never duplicates composition; permanent failure and quota exhaustion relinquish ownership",
  { timeout: 60000 },
  async () =>
    withAutomationDatabase(async (database) => {
      for (const action of ["ambiguous", "failed", "quota"] as const) {
        const f = await automationFixture(database);
        await f.publish(
          linearGraph(f.accountId, [{ key: "text", type: "MESSAGE", config: { text: "Once" } }]),
        );
        await f.trigger.inbound(await f.inbound("hello"));
        let run = await f.current();
        assert.ok(run);
        if (action === "quota")
          await database.execute(
            sql`UPDATE app.plans SET limits='{"monthly_message_limit":0}'::jsonb WHERE id=${f.planId}::uuid`,
          );
        await f.advance(run.id);
        run = await f.current();
        assert.ok(run);
        if (action !== "quota") {
          assert.ok(run.state.waitingMessageId);
          if (action === "ambiguous")
            await database.execute(
              sql`UPDATE app.messages SET status='SENDING' WHERE id=${run.state.waitingMessageId}::uuid`,
            );
          else
            await database.execute(
              sql`UPDATE app.messages SET status='FAILED',error_code='PROVIDER_PERMANENT' WHERE id=${run.state.waitingMessageId}::uuid`,
            );
          await f.advance(run.id);
        }
        run = await f.current();
        assert.equal(run?.status, action === "ambiguous" ? "RUNNING" : "HANDED_OFF");
        const count = await database.execute<{ count: number }>(
          sql`SELECT count(*)::int AS count FROM app.messages WHERE tenant_id=${f.tenantId}::uuid AND direction='OUTBOUND'`,
        );
        assert.equal(count.rows[0]?.count, 1);
      }
    }),
);

void test(
  "independent transactions deduplicate trigger/advance and preserve pinned action effects",
  { timeout: 60000 },
  async () =>
    withAutomationDatabase(async (database) => {
      const f = await automationFixture(database);
      const graph = linearGraph(f.accountId, [
        {
          key: "update",
          type: "CONTACT_UPDATE",
          config: { fields: { name: " Changed ", email: "NEW@EXAMPLE.TEST" } },
        },
        { key: "assign", type: "ASSIGN", config: { userId: f.actorId } },
      ]);
      const published = await f.publish(graph),
        inbound = await f.inbound("hello");
      await Promise.all(Array.from({ length: 6 }, () => f.trigger.inbound(inbound)));
      const run = await f.current();
      assert.ok(run);
      const nextDraft = await f.authoring.save(
        f.context,
        published.id,
        {
          name: published.name,
          graph: linearGraph(f.accountId, [
            {
              key: "update",
              type: "CONTACT_UPDATE",
              config: { fields: { name: "Wrong version" } },
            },
          ]),
        },
        published.revision,
      );
      await f.authoring.publish(f.context, published.id, nextDraft.revision);
      const events = await database.execute<{ id: string }>(
        sql`SELECT id FROM app.outbox_events WHERE aggregate_id=${run.id}::uuid`,
      );
      assert.equal(events.rows.length, 1);
      assert.ok(events.rows[0]);
      const eventId = events.rows[0].id;
      await Promise.all(Array.from({ length: 6 }, () => f.execution.advance(run.id, eventId)));
      const stored = await database.transaction((tx) => f.runs.find(tx, f.tenantId, run.id));
      assert.equal(stored?.status, "COMPLETED");
      assert.equal(stored.flowVersionId, published.publishedVersionId);
      const changed = await database.execute<{
        name: string;
        email: string;
        assigned: string;
      }>(sql`SELECT ct.name,ct.email,c.assigned_user_id AS assigned
      FROM app.contacts ct JOIN app.conversations c ON c.contact_id=ct.id WHERE ct.id=${f.contactId}::uuid`);
      assert.deepEqual(changed.rows, [
        { name: "Changed", email: "new@example.test", assigned: f.actorId },
      ]);
      const audits = await database.execute<{
        action: string;
        count: number;
      }>(sql`SELECT action,count(*)::int AS count FROM app.audit_logs
      WHERE action IN ('AUTOMATION_STARTED','AUTOMATION_CONTACT_UPDATED','AUTOMATION_ASSIGNED','AUTOMATION_COMPLETED') GROUP BY action`);
      assert.equal(audits.rows.length, 4);
      assert.ok(audits.rows.every((row) => row.count === 1));
    }),
);

void test(
  "text acceptance ordering, current correlated choices, early retry and duplicate replies",
  { timeout: 60000 },
  async () =>
    withAutomationDatabase(async (database) => {
      const f = await automationFixture(database);
      const graph = linearGraph(f.accountId, [
        { key: "text", type: "MESSAGE", config: { text: "First" } },
        {
          key: "choice",
          type: "BUTTONS",
          config: { text: "Choose", choices: [{ id: "yes", title: "Yes" }] },
        },
      ]);
      await f.publish({
        ...graph,
        edges: graph.edges.map((e) => (e.from === "choice" ? { ...e, choice: "yes" } : e)),
      });
      await f.trigger.inbound(await f.inbound("hello"));
      let run = await f.current();
      assert.ok(run);
      await f.advance(run.id);
      run = await f.current();
      assert.ok(run?.state.waitingMessageId);
      const firstId = run.state.waitingMessageId;
      await f.advance(run.id);
      let out = await database.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM app.messages WHERE direction='OUTBOUND'`,
      );
      assert.equal(out.rows[0]?.count, 1);
      // Simulate durable provider acceptance, never an actual network request.
      await database.execute(
        sql`UPDATE app.messages SET status='SENT',provider_message_id='wamid.first' WHERE id=${firstId}::uuid`,
      );
      await f.advance(run.id);
      run = await f.current();
      assert.equal(run?.status, "WAITING");
      assert.ok(run.state.waitingMessageId);
      const choiceMessage = run.state.waitingMessageId,
        runId = run.id;
      const reply = await f.inbound("", {
        data: { button_reply: { id: choiceToken(runId, "choice", "yes") } },
        contextMessageId: "wamid.choice",
      });
      await assert.rejects(f.trigger.inbound(reply), /AUTOMATION_ACCEPTANCE_PENDING/u);
      const receipt = await database.execute<{ decision: Record<string, unknown> }>(
        sql`SELECT policy_decision AS decision FROM app.messages WHERE id=${reply}::uuid`,
      );
      assert.notEqual(receipt.rows[0]?.decision.automationProcessed, true);
      await database.execute(
        sql`UPDATE app.messages SET status='SENT',provider_message_id='wamid.choice' WHERE id=${choiceMessage}::uuid`,
      );
      const stale = await f.inbound("", {
        data: { button_reply: { id: choiceToken(runId, "choice", "yes") } },
        contextMessageId: "wamid.old",
      });
      await f.trigger.inbound(stale);
      assert.equal((await f.current())?.status, "WAITING");
      await f.trigger.inbound(await f.inbound("HELLO"));
      assert.equal((await f.current())?.status, "WAITING");
      await Promise.all(Array.from({ length: 4 }, () => f.trigger.inbound(reply)));
      assert.equal((await f.current())?.status, "RUNNING");
      await f.advance(runId);
      assert.equal(await f.current(), undefined);
      out = await database.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM app.messages WHERE direction='OUTBOUND'`,
      );
      assert.equal(out.rows[0]?.count, 2);
    }),
);

void test(
  "ten-step yield is durable and replay cannot repeat contact mutations",
  { timeout: 60000 },
  async () =>
    withAutomationDatabase(async (database) => {
      const f = await automationFixture(database);
      await f.publish(
        linearGraph(
          f.accountId,
          Array.from({ length: 14 }, (_, index) => ({
            key: `update${String(index)}`,
            type: "CONTACT_UPDATE" as const,
            config: { fields: { name: `Step ${String(index)}` } },
          })),
        ),
      );
      await f.trigger.inbound(await f.inbound("hello"));
      const run = await f.current();
      assert.ok(run);
      const eventId = await f.advance(run.id);
      assert.equal((await f.current())?.state.visited.length, 10);
      await f.execution.advance(run.id, eventId);
      assert.equal((await f.current())?.state.visited.length, 10);
      await f.advance(run.id);
      assert.equal(await f.current(), undefined);
      const audits = await database.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM app.audit_logs WHERE action='AUTOMATION_CONTACT_UPDATED'`,
      );
      assert.equal(audits.rows[0]?.count, 14);
    }),
);

void test(
  "live plan/publisher/consent/window changes stop execution without composing",
  { timeout: 60000 },
  async () =>
    withAutomationDatabase(async (database) => {
      for (const policy of ["plan", "publisher", "consent", "window"] as const) {
        const f = await automationFixture(database);
        await f.publish(
          linearGraph(f.accountId, [
            { key: "text", type: "MESSAGE", config: { text: "Must not send" } },
          ]),
        );
        await f.trigger.inbound(await f.inbound("hello"));
        const run = await f.current();
        assert.ok(run);
        if (policy === "plan")
          await database.execute(
            sql`UPDATE app.plans SET feature_flags='{}'::jsonb WHERE id=${f.planId}::uuid`,
          );
        if (policy === "publisher")
          await database.execute(
            sql`UPDATE app.users SET status='DISABLED' WHERE id=${f.actorId}::uuid`,
          );
        if (policy === "consent")
          await database.execute(
            sql`UPDATE app.contacts SET consent_status='OPTED_OUT' WHERE id=${f.contactId}::uuid`,
          );
        if (policy === "window")
          await database.execute(
            sql`UPDATE app.conversations SET window_expires_at=now()-interval '1 second' WHERE id=${f.conversationId}::uuid`,
          );
        await f.advance(run.id);
        const stored = await database.transaction((tx) => f.runs.find(tx, f.tenantId, run.id));
        assert.equal(stored?.status, policy === "window" ? "CANCELLED" : "HANDED_OFF");
        assert.ok(stored.state.reason);
        const out = await database.execute<{ count: number }>(
          sql`SELECT count(*)::int AS count FROM app.messages WHERE tenant_id=${f.tenantId}::uuid AND direction='OUTBOUND'`,
        );
        assert.equal(out.rows[0]?.count, 0);
      }
    }),
);

void test(
  "takeover and run advancement serialize; pause/reactivate never resumes a latched run",
  { timeout: 60000 },
  async () =>
    withAutomationDatabase(async (database) => {
      const f = await automationFixture(database);
      const graph = linearGraph(f.accountId, []);
      let flow = await f.publish({
        ...graph,
        nodes: graph.nodes.map((n) => (n.key === "end" ? { ...n, type: "HUMAN_HANDOFF" } : n)),
      });
      await f.trigger.inbound(await f.inbound("hello"));
      const run = await f.current();
      assert.ok(run);
      await Promise.all([
        f.controls.conversation(f.context, f.conversationId, "takeover"),
        f.advance(run.id),
      ]);
      assert.equal(
        (await f.controls.status(f.context, f.conversationId)).automationState,
        "HANDED_OFF",
      );
      await f.controls.conversation(f.context, f.conversationId, "allow");
      flow = await f.authoring.read(f.context, flow.id);
      flow = await f.controls.flow(f.context, flow.id, flow.revision, "pause");
      flow = await f.controls.flow(f.context, flow.id, flow.revision, "reactivate");
      assert.equal(flow.status, "ACTIVE");
      assert.equal(await f.current(), undefined);
      assert.equal((await f.controls.status(f.context, f.conversationId)).automationState, "NONE");
    }),
);
