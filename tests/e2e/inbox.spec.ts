import { test, expect, type Page } from "@playwright/test";

const ids = Array.from(
  { length: 8 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const owner = ids[0]!,
  tenant = ids[1]!,
  account = ids[2]!,
  contact = ids[3]!,
  thread = ids[4]!,
  other = ids[5]!,
  template = ids[6]!,
  member = ids[7]!;

async function workspace(
  page: Page,
  options: { readonly?: boolean; uncertain?: boolean; pages?: boolean } = {},
) {
  const state = {
    refreshes: 0,
    lists: 0,
    histories: 0,
    actions: [] as string[],
    keys: [] as string[],
    sent: new Map<string, string>(),
    notes: [] as {
      id: string;
      conversationId: string;
      authorId: string;
      note: string;
      createdAt: string;
    }[],
    forceRotate: false,
    terminal: false,
    failList: false,
    listErrors: [] as number[],
    holdHistory: null as Promise<void> | null,
  };
  const conversation = {
    id: thread,
    contactId: contact,
    contactName: "Ada Clinic",
    phoneE164: "+919876543210",
    consentStatus: "OPTED_IN",
    whatsappAccountId: account,
    accountStatus: "CONNECTED",
    assignedUserId: null as string | null,
    status: "OPEN",
    automationState: "NONE",
    unreadCount: 2,
    lastMessageAt: new Date().toISOString(),
    windowExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    serviceWindowOpen: true,
  };
  let failed = false;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const params = new URL(route.request().url()).searchParams;
    const respond = (data: unknown) =>
      route.fulfill({ json: { data, request_id: "inbox-browser" } });
    const error = (status: number, code: string) =>
      route.fulfill({
        status,
        json: {
          error: {
            code,
            message: code,
            request_id: "inbox-browser",
            retryable: false,
            details: [],
          },
        },
      });
    if (path === "/auth/refresh") {
      state.refreshes++;
      if (state.terminal) return error(401, "INVALID_SESSION");
      return respond({ access_token: `token-${String(state.refreshes)}` });
    }
    if (path === "/auth/logout") return respond({ logged_out: true });
    if (path === "/me")
      return respond({
        id: owner,
        email: "fixture@example.test",
        display_name: "Owner",
        role: { system_key: "TENANT_ADMIN", name: "Admin" },
        tenant: { id: tenant, name: "Fixture Clinic" },
        permissions: [
          "conversation.read",
          "template.read",
          ...(options.readonly
            ? []
            : ["conversation.reply", "conversation.assign", "conversation.close"]),
        ],
        subscription: null,
      });
    if (path === "/contacts") return respond({ contacts: [], nextCursor: null });
    if (path.endsWith("/automation/takeover") || path.endsWith("/automation/allow")) {
      const action = path.endsWith("/takeover") ? "takeover" : "allow";
      state.actions.push(`automation:${action}`);
      conversation.automationState = action === "takeover" ? "HANDED_OFF" : "NONE";
      return respond({ automationState: conversation.automationState, run: null });
    }
    if (path.endsWith("/automation"))
      return respond({ automationState: conversation.automationState, run: null });
    if (path === "/templates")
      return respond([
        {
          id: template,
          whatsappAccountId: account,
          name: "reminder",
          language: "en_US",
          providerStatus: "APPROVED",
          approvalStatus: "NOT_REQUIRED",
          contentVersion: 1,
          approvedVersion: null,
          components: [{ type: "BODY", text: "Hello {{1}}" }],
        },
      ]);
    if (
      path.startsWith("/conversations") &&
      (state.terminal ||
        (state.forceRotate && route.request().headers().authorization === "Bearer token-1"))
    )
      return error(401, "UNAUTHENTICATED");
    if (path === "/conversations/assignees")
      return respond({
        assignees: options.pages
          ? params.has("cursor")
            ? [{ id: member, displayName: "Assistant" }]
            : [{ id: owner, displayName: "Owner" }]
          : [
              { id: owner, displayName: "Owner" },
              { id: member, displayName: "Assistant" },
            ],
        nextCursor: options.pages && !params.has("cursor") ? "next-team" : null,
      });
    if (path === "/conversations") {
      state.lists++;
      const status = state.listErrors.shift();
      if (status !== undefined) return error(status, `Fixture error ${String(status)}`);
      if (state.failList) {
        state.failList = false;
        return error(503, "Temporarily unavailable");
      }
      const rows = [
        conversation,
        { ...conversation, id: other, contactName: "Bob Garage", phoneE164: "+919812345678" },
      ].filter(
        (c) =>
          !params.get("search") ||
          c.contactName.toLowerCase().includes(params.get("search")!.toLowerCase()),
      );
      return respond({ conversations: rows, nextCursor: null });
    }
    const conversationId = path.includes(other) ? other : thread;
    if (path === `/conversations/${conversationId}`) {
      state.histories++;
      const hold = state.holdHistory;
      state.holdHistory = null;
      if (hold !== null) await hold;
      const older = params.get("cursor") === "older";
      return respond({
        conversation: { ...conversation, id: conversationId },
        messages: [
          {
            id: older ? other : contact,
            direction: "INBOUND",
            messageType: "TEXT",
            status: "RECEIVED",
            content: { data: { body: older ? "Older customer message" : "Hello from customer" } },
            errorCode: null,
            createdAt: new Date().toISOString(),
            providerCreatedAt: null,
            sentAt: null,
            deliveredAt: null,
            readAt: null,
          },
        ],
        nextCursor: older ? null : "older",
      });
    }
    if (path.endsWith("/notes") && route.request().method() === "GET")
      return respond({
        notes: options.pages
          ? state.notes.slice(params.has("cursor") ? 1 : 0, params.has("cursor") ? 2 : 1)
          : state.notes,
        nextCursor:
          options.pages && state.notes.length > 1 && !params.has("cursor") ? "older-notes" : null,
      });
    if (route.request().method() === "POST") {
      state.actions.push(path);
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (path.endsWith("/messages")) {
        const key = String(body.clientMessageKey);
        state.keys.push(key);
        const existing = state.sent.has(key);
        state.sent.set(key, "accepted");
        if (options.uncertain && !failed) {
          failed = true;
          return route.abort("failed");
        }
        return respond({
          id: contact,
          idempotent: existing,
          status: "CREATED",
          messageType: "TEXT",
        });
      }
      if (path.endsWith("/notes")) {
        const note = {
          id: String(body.id),
          conversationId,
          authorId: owner,
          note: String(body.note),
          createdAt: new Date().toISOString(),
        };
        state.notes.push(note);
        return respond({ note, idempotent: false });
      }
      if (path.endsWith("/assign")) {
        conversation.assignedUserId =
          typeof body.assignedUserId === "string" ? body.assignedUserId : null;
        return respond({ conversationId, assignedUserId: conversation.assignedUserId });
      }
      if (path.endsWith("/close")) conversation.status = "CLOSED";
      if (path.endsWith("/reopen")) conversation.status = "OPEN";
      if (path.endsWith("/read")) conversation.unreadCount = 0;
      if (path.endsWith("/unread")) conversation.unreadCount = 1;
      return respond(conversation);
    }
    return error(404, "Unexpected fixture route");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await expect(page.getByRole("button", { name: /Ada Clinic/ })).toBeVisible();
  return state;
}

test("explicit Inbox takeover and allow change ownership without sending a reply", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.getByRole("button", { name: /Ada Clinic/u }).click();
  const ownership = page.getByRole("region", { name: "Automation ownership" });
  page.once("dialog", (dialog) => dialog.accept());
  await ownership.getByRole("button", { name: "Take over / disable bot", exact: true }).click();
  await expect(ownership).toContainText("Bot ownership: HANDED_OFF");
  page.once("dialog", (dialog) => dialog.accept());
  await ownership.getByRole("button", { name: "Allow future automation", exact: true }).click();
  await expect(ownership).toContainText("Bot ownership: NONE");
  expect(state.actions).toEqual(["automation:takeover", "automation:allow"]);
  expect(state.sent.size).toBe(0);
});
async function select(page: Page) {
  await page.getByRole("button", { name: /Ada Clinic/ }).click();
  await expect(page.getByText("Hello from customer", { exact: true })).toBeVisible();
}
void test("Inbox text, assignment, notes, explicit read, close/reopen and safe literal rendering", async ({
  page,
}) => {
  const state = await workspace(page);
  await select(page);
  expect(state.actions).toHaveLength(0);
  await page.getByLabel("Reply text", { exact: true }).fill("Agent response");
  page.once("dialog", (d) => {
    void d.accept();
  });
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Reply CREATED");
  expect(state.sent.size).toBe(1);
  await page.getByLabel("Assigned team member").selectOption(member);
  await expect(page.getByLabel("Assigned team member")).toHaveValue(member);
  await page.getByLabel("Internal note", { exact: true }).fill("<script>not executable</script>");
  await page.getByRole("button", { name: "Add internal note" }).click();
  await expect(page.getByText("<script>not executable</script>", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark displayed read" }).click();
  await expect.poll(() => state.actions.some((p) => p.endsWith("/read"))).toBe(true);
  await page.getByRole("button", { name: "Close conversation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send reply", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Reopen conversation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send reply", exact: true })).toBeEnabled();
});
void test("mobile drill-in, older page navigation and drafts retained across conversation selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await workspace(page);
  await select(page);
  await page.getByLabel("Reply text", { exact: true }).fill("Keep this draft");
  await page.getByRole("button", { name: "Older messages", exact: true }).click();
  await expect(page.getByText("Older customer message", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Return to latest messages" }).click();
  await page.getByRole("button", { name: "Back to conversations" }).click();
  await page.getByRole("button", { name: /Bob Garage/ }).click();
  await expect(page.getByLabel("Reply text", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Back to conversations" }).click();
  await select(page);
  await expect(page.getByLabel("Reply text", { exact: true })).toHaveValue("Keep this draft");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
void test("uncertain reply retry retains the request identity without creating another accepted action", async ({
  page,
}) => {
  const state = await workspace(page, { uncertain: true });
  await select(page);
  await page.getByLabel("Reply text", { exact: true }).fill("Only once");
  page.once("dialog", (d) => {
    void d.accept();
  });
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Reply composer" }).getByRole("alert"),
  ).toContainText("uncertain");
  page.once("dialog", (d) => {
    void d.accept();
  });
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Reply CREATED");
  expect(state.keys[0]).toBe(state.keys[1]);
  expect(state.sent.size).toBe(1);
});
void test("readonly Inbox does not expose operational mutations", async ({ page }) => {
  await workspace(page, { readonly: true });
  await select(page);
  await expect(page.getByRole("button", { name: "Send reply", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add internal note" })).toHaveCount(0);
  await expect(page.getByLabel("Assigned team member")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Close conversation", exact: true })).toHaveCount(
    0,
  );
});
void test("eligible template selection exposes parameters and retained provider template text", async ({
  page,
}) => {
  await workspace(page);
  await select(page);
  await page.getByLabel("Reply type").selectOption("TEMPLATE");
  await page.getByLabel("Reply template", { exact: true }).selectOption(template);
  await expect(page.getByText(/Template content .*Hello/u)).toBeVisible();
  await page.getByLabel("Template variable 1").fill("Ada");
  page.once("dialog", (d) => {
    void d.accept();
  });
  await page.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Reply CREATED");
});
void test("polling refreshes latest data, pauses while hidden and resumes without destroying drafts", async ({
  page,
}) => {
  await page.clock.install();
  const state = await workspace(page);
  await select(page);
  await page.getByLabel("Reply text", { exact: true }).fill("Draft during polling");
  const before = state.histories;
  await page.clock.runFor(16000);
  await expect.poll(() => state.histories).toBeGreaterThan(before);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hidden = state.histories;
  await page.clock.runFor(60000);
  expect(state.histories).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => state.histories).toBeGreaterThan(hidden);
  await expect(page.getByLabel("Reply text", { exact: true })).toHaveValue("Draft during polling");
});
void test("parallel polling reads share one same-runtime token rotation", async ({ page }) => {
  const state = await workspace(page);
  state.forceRotate = true;
  await select(page);
  expect(state.refreshes).toBe(2);
});

void test("transient refresh errors retain drafts/data, back off 30/60 seconds and reset after recovery", async ({
  page,
}) => {
  await page.clock.install();
  const state = await workspace(page);
  await select(page);
  await page.getByLabel("Reply text", { exact: true }).fill("Retain on failure");
  state.listErrors.push(503, 503);
  await page.getByRole("button", { name: "Refresh Inbox", exact: true }).click();
  await expect(page.getByRole("region", { name: "Shared Inbox" }).getByRole("alert")).toContainText(
    "Fixture error 503",
  );
  await expect(page.getByText("Hello from customer", { exact: true })).toBeVisible();
  const first = state.lists;
  await page.clock.runFor(29999);
  expect(state.lists).toBe(first);
  await page.clock.runFor(1);
  await expect.poll(() => state.lists).toBe(first + 1);
  await expect(page.getByRole("button", { name: "Refresh Inbox", exact: true })).toBeEnabled();
  await page.clock.runFor(59999);
  expect(state.lists).toBe(first + 1);
  await page.clock.runFor(1);
  await expect.poll(() => state.lists).toBe(first + 2);
  await expect(page.getByRole("region", { name: "Shared Inbox" }).getByRole("alert")).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Reply text", { exact: true })).toHaveValue("Retain on failure");
  await page.clock.runFor(15000);
  await expect.poll(() => state.lists).toBe(first + 3);
});

for (const status of [401, 403, 404]) {
  void test(`terminal ${String(status)} stops polling and authorization failures clear protected data`, async ({
    page,
  }) => {
    await page.clock.install();
    const state = await workspace(page);
    await select(page);
    if (status === 401) state.terminal = true;
    else state.listErrors.push(status);
    await page.getByRole("button", { name: "Refresh Inbox", exact: true }).click();
    await expect(page.getByRole("button", { name: "Refresh Inbox", exact: true })).toBeDisabled();
    await expect(
      page.getByRole("region", { name: "Shared Inbox" }).getByRole("alert"),
    ).toContainText("Refresh stopped");
    await expect(page.getByText("Hello from customer", { exact: true })).toHaveCount(
      status === 404 ? 1 : 0,
    );
    const counts = [state.lists, state.histories, state.refreshes];
    await page.clock.runFor(120000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect([state.lists, state.histories, state.refreshes]).toEqual(counts);
  });
}

void test("offline pauses polling and reconnect/focus coalesce while a slow load is in flight", async ({
  page,
}) => {
  await page.clock.install();
  const state = await workspace(page);
  await select(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
  });
  const before = state.histories;
  await page.clock.runFor(120000);
  expect(state.histories).toBe(before);
  let release!: () => void;
  state.holdHistory = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(() => state.histories).toBe(before + 1);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
  });
  await page.clock.runFor(60000);
  expect(state.histories).toBe(before + 1);
  release();
  await expect(page.getByRole("button", { name: "Refresh Inbox", exact: true })).toBeEnabled();
  await page.clock.runFor(1);
  await expect.poll(() => state.histories).toBe(before + 2);
});

void test("selection changes and leaving Inbox discard late history responses and dispose polling", async ({
  page,
}) => {
  await page.clock.install();
  const state = await workspace(page);
  await select(page);
  let release!: () => void;
  state.holdHistory = new Promise<void>((resolve) => {
    release = resolve;
  });
  const before = state.histories;
  await page.getByRole("button", { name: "Refresh Inbox", exact: true }).click();
  await expect.poll(() => state.histories).toBe(before + 1);
  await page.getByRole("button", { name: /Bob Garage/ }).click();
  await expect(page.getByLabel("Reply text", { exact: true })).toBeVisible();
  await page.getByLabel("Reply text", { exact: true }).fill("Bob draft");
  release();
  await expect(page.getByLabel("Reply text", { exact: true })).toHaveValue("Bob draft");
  await expect(page.getByRole("button", { name: /Bob Garage/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  const count = state.histories;
  await page.clock.runFor(120000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(state.histories).toBe(count);
  await expect(page.getByRole("region", { name: "Shared Inbox" })).toHaveCount(0);
});

void test("search has empty and recovery states without dispatching mutations", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.getByLabel("Search name or phone").fill("no-match");
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByText("No conversations match these filters.")).toBeVisible();
  await page.getByLabel("Search name or phone").fill("Ada");
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByRole("button", { name: /Ada Clinic/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Bob Garage/ })).toHaveCount(0);
  expect(state.actions).toHaveLength(0);
});

void test("older notes and additional team options are independently paginated", async ({
  page,
}) => {
  const state = await workspace(page, { pages: true });
  state.notes.push(
    ...["Latest team note", "Older team note"].map((note, index) => ({
      id: String(index),
      conversationId: thread,
      authorId: owner,
      note,
      createdAt: new Date().toISOString(),
    })),
  );
  await select(page);
  await expect(page.getByText("Latest team note", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Older notes", exact: true }).click();
  await expect(page.getByText("Older team note", { exact: true })).toBeVisible();
  await expect(page.getByText("Latest team note", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Latest notes", exact: true }).click();
  await expect(page.getByText("Latest team note", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load team options", exact: true }).click();
  await page.getByLabel("Assigned team member").selectOption(member);
  await expect(page.getByLabel("Assigned team member")).toHaveValue(member);
});
