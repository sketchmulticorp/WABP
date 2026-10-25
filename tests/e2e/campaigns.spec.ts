import { expect, test, type Page } from "@playwright/test";
import type { CampaignDraft, CampaignDraftInput } from "../../packages/contracts/src/campaigns";

const accountId = "00000000-0000-4000-8000-000000000001",
  templateId = "00000000-0000-4000-8000-000000000002",
  contactId = "00000000-0000-4000-8000-000000000003",
  groupId = "00000000-0000-4000-8000-000000000004";
const secondTemplateId = "00000000-0000-4000-8000-000000000008";
async function workspace(
  page: Page,
  options: {
    failList?: boolean;
    conflict?: boolean;
    emptyOptions?: boolean;
    readOnly?: boolean;
    admin?: boolean;
    previewFailure?: boolean;
    noPreviewPermission?: boolean;
    initialDraft?: CampaignDraft;
    populatedReport?: boolean;
  } = {},
) {
  let draft: CampaignDraft | null = options.initialDraft ?? null;
  const requests: { path: string; method: string; body: unknown }[] = [];
  let failList = options.failList ?? false;
  let conflict = options.conflict ?? false;
  const preflightRunId = "00000000-0000-4000-8000-000000000006";
  const writes: CampaignDraftInput[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method();
    requests.push({
      path,
      method,
      body: method === "POST" || method === "PATCH" ? route.request().postDataJSON() : null,
    });
    const respond = (data: unknown) =>
      route.fulfill({ json: { data, request_id: "campaign-browser-test" } });
    if (path === "/auth/refresh") return respond({ access_token: "test-only" });
    if (path === "/me")
      return respond({
        id: "00000000-0000-4000-8000-000000000007",
        display_name: "Clinic member",
        role: { system_key: options.admin ? "TENANT_ADMIN" : "TENANT_USER" },
        permissions: [
          "campaign.read",
          "contact.read",
          ...(options.noPreviewPermission ? [] : ["template.read"]),
          ...(options.populatedReport ? ["campaign.export", "contact.export"] : []),
          ...(options.readOnly ? [] : ["campaign.write"]),
          ...(options.admin ? ["campaign.approve", "campaign.send", "campaign.cancel"] : []),
        ],
        tenant: { name: "Test clinic" },
      });
    if (path === "/contacts")
      return respond({
        contacts: [{ id: contactId, name: "Asha", phoneE164: "+919876543210" }],
        nextCursor: null,
      });
    if (path === "/campaigns/draft-options")
      return respond({
        accounts: options.emptyOptions
          ? []
          : [{ id: accountId, displayPhoneNumber: "+919876543210", status: "CONNECTED" }],
        templates: options.emptyOptions
          ? []
          : [
              {
                id: templateId,
                whatsappAccountId: accountId,
                name: "reminder",
                language: "en_US",
                providerStatus: "APPROVED",
                approvalStatus: "NOT_REQUIRED",
                components: [{ type: "BODY", text: "Hello {{1}}, your appointment is ready." }],
              },
              {
                id: secondTemplateId,
                whatsappAccountId: accountId,
                name: "follow_up",
                language: "en_US",
                providerStatus: "APPROVED",
                approvalStatus: "NOT_REQUIRED",
                components: [{ type: "BODY", text: "Follow up message" }],
              },
            ],
        groups: [{ id: groupId, name: "Appointments" }],
      });
    if (path === `/templates/${templateId}/preview`) {
      if (options.previewFailure)
        return route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Preview unavailable" } },
        });
      return respond({
        preview: {
          header: "Appointment reminder",
          body: "Hello {{1}}, your appointment is ready.",
          footer: "Reply to confirm",
        },
      });
    }
    if (path === `/templates/${secondTemplateId}/preview`)
      return respond({ preview: { header: null, body: "Follow up message", footer: null } });
    if (path === "/auth/logout") return respond({});
    if (path === "/campaigns" && method === "GET") {
      if (failList) {
        failList = false;
        return route.fulfill({
          status: 503,
          json: {
            error: { code: "UNAVAILABLE", message: "Campaign list is temporarily unavailable." },
          },
        });
      }
      return respond({ campaigns: draft === null ? [] : [draft], nextCursor: null });
    }
    if (path.endsWith("/preflight") && method === "POST")
      return respond({
        id: preflightRunId,
        campaignId: draft?.id,
        contentVersion: draft?.contentVersion,
        status: "QUEUED",
        blockers: [],
        estimates: null,
        errorCode: null,
        createdAt: "2026-10-13T00:00:03.000Z",
        startedAt: null,
        completedAt: null,
      });
    if (path.endsWith(`/preflight/${preflightRunId}`) && method === "GET")
      return respond({
        id: preflightRunId,
        campaignId: draft?.id,
        contentVersion: draft?.contentVersion,
        status: "COMPLETED",
        blockers: [],
        estimates: {
          selectedContacts: 1,
          groupMemberships: 1,
          duplicateSelections: 1,
          resolvedRecipients: 1,
          eligibleRecipients: 1,
          skippedRecipients: 0,
          skippedByReason: {},
          monthlyLimit: 100,
          monthlyUsed: 5,
          monthlyRemaining: 95,
          estimatedUsage: 1,
          remainingAfterSend: 94,
        },
        errorCode: null,
        createdAt: "2026-10-13T00:00:03.000Z",
        startedAt: "2026-10-13T00:00:04.000Z",
        completedAt: "2026-10-13T00:00:05.000Z",
      });
    if (
      (path === "/campaigns" && method === "POST") ||
      (path.startsWith("/campaigns/") && method === "PATCH")
    ) {
      if (method === "PATCH" && conflict) {
        conflict = false;
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: "CAMPAIGN_VERSION_CONFLICT",
              message: "This campaign changed. Reload it before saving.",
            },
          },
        });
      }
      const input = route.request().postDataJSON() as CampaignDraftInput;
      writes.push(input);
      draft = {
        ...input,
        id: "00000000-0000-4000-8000-000000000005",
        status: "DRAFT",
        contentVersion: (draft?.contentVersion ?? 0) + 1,
        revision: String(writes.length).repeat(64),
        approvalStatus: options.admin ? "NOT_REQUIRED" : "DRAFT",
        approvedVersion: null,
        createdAt: "2026-10-13T00:00:00.000Z",
        updatedAt: `2026-10-13T00:00:0${String(writes.length)}.000Z`,
      };
      return respond(draft);
    }
    if (path === "/reports/exports")
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
        body: "\uFEFFstatus,count\r\nDELIVERED,2\r\nFAILED,1\r\n",
      });
    if (path.endsWith("/report"))
      return respond({
        campaign: draft,
        counts: options.populatedReport
          ? [
              { status: "DELIVERED", count: 2 },
              { status: "FAILED", count: 1 },
            ]
          : [],
        recipients: options.populatedReport
          ? [{ id: "recipient-1", contactId, status: "DELIVERED", reason: null, messageId: null }]
          : [],
        nextCursor:
          options.populatedReport && !new URL(route.request().url()).searchParams.has("cursor")
            ? "00000000-0000-4000-8000-000000000099"
            : null,
        finalPreflight: null,
        asOf: "2026-10-15T00:00:00.000Z",
      });
    if (path.startsWith("/campaigns/") && method === "POST" && draft !== null) {
      const action = path.split("/").at(-1);
      if (action === "request-approval") draft.approvalStatus = "PENDING";
      if (action === "approve") draft.approvalStatus = "APPROVED";
      if (action === "reject") draft.approvalStatus = "REJECTED";
      if (action === "send" || action === "resume") draft.status = "QUEUED";
      if (action === "schedule") draft.status = "SCHEDULED";
      if (action === "pause") draft.status = "PAUSED";
      if (action === "cancel") draft.status = "CANCELLED";
      return respond(draft);
    }
    if (path.startsWith("/campaigns/")) return respond(draft);
    if (path === "/groups") return respond({ groups: [] });
    return route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "Unexpected test route" } },
    });
  });
  await page.goto("/");
  if ((page.viewportSize()?.width ?? 1280) <= 768)
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("button", { name: "Campaigns", exact: true }).click();
  return { writes, requests };
}
async function create(page: Page) {
  await page.getByRole("button", { name: "New campaign" }).click();
  await page.getByLabel("Campaign name").fill("Appointment reminders");
  await page.getByLabel("Sending account").selectOption(accountId);
  await page.getByRole("combobox", { name: "Template", exact: true }).selectOption(templateId);
  await page.getByRole("button", { name: "Continue to Recipients", exact: true }).click();
  await page.getByRole("checkbox", { name: /Asha/u }).check();
  await page.getByRole("checkbox", { name: "Appointments", exact: true }).check();
  await page.getByRole("button", { name: "Continue to Personalization", exact: true }).click();
  await page.getByRole("button", { name: "Add {{1}}", exact: true }).click();
  await page.getByLabel("Variable source 1").selectOption("CONTACT_FIELD");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText(
      "Draft saved. No messages sent. Review approval and run recipient checks below.",
    ),
  ).toBeVisible();
}

function savedDraft(overrides: Partial<CampaignDraft> = {}): CampaignDraft {
  return {
    id: "00000000-0000-4000-8000-000000000005",
    name: "Saved reminder",
    description: null,
    whatsappAccountId: accountId,
    templateId,
    audienceDefinition: { version: 1, contactIds: [], groupIds: [] },
    variableMapping: {},
    scheduleAt: null,
    scheduleTimezone: "UTC",
    status: "DRAFT",
    contentVersion: 1,
    revision: "a".repeat(64),
    approvalStatus: "APPROVED",
    approvedVersion: 1,
    createdAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:00:00.000Z",
    ...overrides,
  };
}

void test("saved report shows actual status counts, pages recipients and confirms private CSV export", async ({
  page,
}) => {
  const draft = savedDraft({ status: "RUNNING" });
  const { requests } = await workspace(page, {
    admin: true,
    initialDraft: draft,
    populatedReport: true,
  });
  await page.getByRole("button", { name: "Open Saved reminder", exact: true }).click();
  const detail = page.getByRole("region", { name: "Campaign approval and delivery" });
  await expect(detail.locator(".campaign-metrics strong")).toHaveText(["2", "1"]);
  await expect(detail.getByRole("cell", { name: contactId, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next recipients", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next recipients", exact: true })).toBeDisabled();
  page.once("dialog", (dialog) => {
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Export campaign recipients CSV", exact: true }).click();
  expect(requests.filter((r) => r.path === "/reports/exports")).toHaveLength(0);
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export campaign recipients CSV", exact: true }).click();
  expect((await downloaded).suggestedFilename()).toBe("report-campaign-recipients.csv");
  expect(requests.find((r) => r.path === "/reports/exports")?.body).toEqual({
    kind: "campaign-recipients",
    campaignId: draft.id,
  });
  expect(requests.filter((r) => r.path.endsWith("/send"))).toHaveLength(0);
});

void test("changing templates discards a late preview response", async ({ page }) => {
  await workspace(page);
  let release = () => {};
  let handled = () => {};
  const responseHandled = new Promise<void>((resolve) => {
    handled = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/templates/${templateId}/preview`, async (route) => {
    try {
      await gate;
      await route.fulfill({
        json: {
          data: { preview: { header: null, body: "Obsolete preview", footer: null } },
          request_id: "late-preview",
        },
      });
    } finally {
      handled();
    }
  });
  try {
    await page.getByRole("button", { name: "New campaign", exact: true }).click();
    await page.getByLabel("Sending account").selectOption(accountId);
    const requested = page.waitForRequest((request) =>
      request.url().endsWith(`/templates/${templateId}/preview`),
    );
    await page.getByRole("combobox", { name: "Template", exact: true }).selectOption(templateId);
    await requested;
    await expect(
      page.getByRole("complementary", { name: "Message preview" }).getByRole("status"),
    ).toContainText("Loading preview");
    await page
      .getByRole("combobox", { name: "Template", exact: true })
      .selectOption(secondTemplateId);
    await expect(
      page
        .getByRole("complementary", { name: "Message preview" })
        .getByText("Follow up message", { exact: true }),
    ).toBeVisible();
    release();
    await responseHandled;
    await expect(
      page
        .getByRole("complementary", { name: "Message preview" })
        .getByText("Follow up message", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Obsolete preview", { exact: true })).toHaveCount(0);
  } finally {
    release();
  }
});

void test("Admin approval binds the saved revision and exposes delivery separately", async ({
  page,
}) => {
  const draft = savedDraft({
    approvalStatus: "PENDING",
    approvedVersion: null,
    approvalRequestedBy: "00000000-0000-4000-8000-000000000009",
  });
  const { requests } = await workspace(page, { admin: true, initialDraft: draft });
  await page.getByRole("button", { name: "Open Saved reminder", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send now", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Approve saved version", exact: true }).click();
  await expect(page.getByRole("button", { name: "Send now", exact: true })).toBeVisible();
  expect(requests.find((r) => r.path.endsWith("/approve"))?.body).toEqual({
    expectedContentVersion: 1,
    expectedRevision: draft.revision,
  });
  expect(requests.filter((r) => r.path.endsWith("/send"))).toHaveLength(0);
});

void test("variable-only changes guard discard and browser reload", async ({ page }) => {
  await workspace(page, { initialDraft: savedDraft() });
  await page.getByRole("button", { name: "Open Saved reminder", exact: true }).click();
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await page.getByRole("button", { name: "3 Personalization", exact: true }).click();
  await page.getByRole("button", { name: "Add {{1}}", exact: true }).click();
  page.once("dialog", (dialog) => {
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Back to campaign", exact: true }).click();
  await expect(page.getByLabel("Variable key 1")).toHaveValue("1");
  let unloadPrompt = false;
  page.once("dialog", (dialog) => {
    unloadPrompt = dialog.type() === "beforeunload";
    void dialog.accept();
  });
  await page.reload();
  expect(unloadPrompt).toBe(true);
  await expect(page.getByRole("button", { name: "Campaigns", exact: true })).toBeVisible();
});

void test("wizard preserves unsaved values between steps and renders safe personalized preview", async ({
  page,
}) => {
  const { writes, requests } = await workspace(page);
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page.getByLabel("Campaign name").fill("Unsent reminder");
  await page.getByLabel("Description", { exact: true }).fill("Keep this draft");
  await page.getByLabel("Sending account").selectOption(accountId);
  await page.getByRole("combobox", { name: "Template", exact: true }).selectOption(templateId);
  const preview = page.getByRole("complementary", { name: "Message preview" });
  await expect(
    preview.getByText("Hello {{1}}, your appointment is ready.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to Recipients", exact: true }).click();
  await page.getByRole("checkbox", { name: /Asha/u }).check();
  await page.getByRole("button", { name: "Continue to Personalization", exact: true }).click();
  await page.getByRole("button", { name: "Add {{1}}", exact: true }).click();
  await page.getByLabel("Literal value 1").fill("<img src=x onerror=alert(1)>");
  await expect(
    preview.getByText("Hello <img src=x onerror=alert(1)>, your appointment is ready.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(preview.locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "1 Template", exact: true }).click();
  await expect(page.getByLabel("Campaign name")).toHaveValue("Unsent reminder");
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Keep this draft");
  await page.getByRole("button", { name: "2 Recipients", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Asha/u })).toBeChecked();
  await page.getByRole("button", { name: "3 Personalization", exact: true }).click();
  await expect(page.getByLabel("Literal value 1")).toHaveValue("<img src=x onerror=alert(1)>");
  expect(writes).toHaveLength(0);
  expect(
    requests.filter((r) => r.method === "POST" && r.path.startsWith("/campaigns")),
  ).toHaveLength(0);
});

void test("save reveals invalid hidden step and later schedule requires a UTC value", async ({
  page,
}) => {
  const { writes } = await workspace(page);
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page.getByRole("button", { name: "5 Review", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByLabel("Campaign name")).toBeVisible();
  await expect(
    page.getByRole("form", { name: "Campaign draft editor" }).getByRole("alert"),
  ).toBeVisible();
  await page.getByLabel("Campaign name").fill("Schedule check");
  await page.getByLabel("Sending account").selectOption(accountId);
  await page.getByRole("combobox", { name: "Template", exact: true }).selectOption(templateId);
  await page.getByRole("button", { name: "4 Schedule", exact: true }).click();
  await page.getByLabel("Delivery timing").selectOption("later");
  await page.getByRole("button", { name: "Continue to Review", exact: true }).click();
  await expect(
    page.getByRole("form", { name: "Campaign draft editor" }).getByRole("alert"),
  ).toContainText("Choose a date and time in UTC");
  expect(writes).toHaveLength(0);
});

void test("metadata-only edit preserves exact scheduled instant/timezone and empty audience", async ({
  page,
}) => {
  const original = savedDraft({
    scheduleAt: "2030-01-01T09:00:12.123+05:30",
    scheduleTimezone: "Asia/Kolkata",
  });
  const { writes } = await workspace(page, { initialDraft: original });
  await page.getByRole("button", { name: "Open Saved reminder", exact: true }).click();
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await page.getByLabel("Campaign name").fill("Renamed reminder");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit draft", exact: true })).toBeVisible();
  expect(writes[0]?.scheduleAt).toBe(original.scheduleAt);
  expect(writes[0]?.scheduleTimezone).toBe("Asia/Kolkata");
  expect(writes[0]?.audienceDefinition).toEqual({ version: 1, contactIds: [], groupIds: [] });
});

void test("dirty close and workspace navigation cancel safely then discard only on acceptance", async ({
  page,
}) => {
  const { writes } = await workspace(page);
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page.getByLabel("Campaign name").fill("Keep my work");
  page.once("dialog", (dialog) => {
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Back to campaign", exact: true }).click();
  await expect(page.getByLabel("Campaign name")).toHaveValue("Keep my work");
  page.once("dialog", (dialog) => {
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Groups", exact: true }).click();
  await expect(page.getByLabel("Campaign name")).toHaveValue("Keep my work");
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Back to campaign", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your first campaign starts here" }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});

void test("dirty sign-out can be cancelled and accepted without saving", async ({ page }) => {
  const { requests } = await workspace(page);
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page.getByLabel("Campaign name").fill("Not saved");
  page.once("dialog", (dialog) => {
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Campaign name")).toHaveValue("Not saved");
  expect(requests.filter((r) => r.path === "/auth/logout")).toHaveLength(0);
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  expect(requests.filter((r) => r.path === "/auth/logout")).toHaveLength(1);
});

void test("preview error is actionable and does not invent sample content", async ({ page }) => {
  await workspace(page, { previewFailure: true });
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page.getByLabel("Sending account").selectOption(accountId);
  await page.getByRole("combobox", { name: "Template", exact: true }).selectOption(templateId);
  const preview = page.getByRole("complementary", { name: "Message preview" });
  await expect(preview.getByRole("alert")).toContainText("Preview unavailable");
  await expect(preview.getByText("Hello {{1}}", { exact: false })).toHaveCount(0);
});

void test("preview permission denial makes no template preview request", async ({ page }) => {
  const { requests } = await workspace(page, { noPreviewPermission: true });
  await page.getByRole("button", { name: "New campaign", exact: true }).click();
  await page.getByLabel("Sending account").selectOption(accountId);
  await page.getByRole("combobox", { name: "Template", exact: true }).selectOption(templateId);
  await expect(
    page.getByText("Your role does not have template preview access.", { exact: true }),
  ).toBeVisible();
  expect(requests.filter((r) => r.path.includes("/preview"))).toHaveLength(0);
});

for (const width of [375, 768, 1440]) {
  void test(`wizard responsive layout and step focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await workspace(page);
    await page.getByRole("button", { name: "New campaign", exact: true }).click();
    await page.getByRole("button", { name: "4 Schedule", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Schedule", exact: true })).toBeFocused();
    await expect(page.getByLabel("Delivery timing")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.getByRole("complementary", { name: "Message preview" })).toBeVisible();
  });
}
void test("creates, edits and preflights a mobile campaign draft without exposing send controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { writes } = await workspace(page);
  await expect(
    page.getByRole("heading", { name: "Your first campaign starts here" }),
  ).toBeVisible();
  await create(page);
  expect(writes[0]?.audienceDefinition).toEqual({
    version: 1,
    contactIds: [contactId],
    groupIds: [groupId],
  });
  expect(writes[0]?.variableMapping).toEqual({ "1": { source: "CONTACT_FIELD", field: "name" } });
  await expect(page.getByRole("form", { name: "Campaign draft editor" })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await page.getByRole("button", { name: "3 Personalization", exact: true }).click();
  await page.getByLabel("Variable source 1").selectOption("LITERAL");
  await page.getByLabel("Literal value 1").fill("Asha");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("button", { name: "Edit draft", exact: true })).toBeVisible();
  expect(writes[1]?.variableMapping).toEqual({ "1": { source: "LITERAL", value: "Asha" } });
  await page.getByRole("button", { name: "Run preflight" }).click();
  await expect(page.getByText("Preflight passed.")).toBeVisible();
  await expect(page.getByText("Duplicate selections removed")).toBeVisible();
  await expect(page.getByRole("button", { name: /^(send|schedule|approve)$/iu })).toHaveCount(0);
  const editor = page.getByRole("form", { name: "Campaign draft editor" });
  await expect(editor).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
void test("recovers a list failure and preserves unsaved draft input after a stale edit", async ({
  page,
}) => {
  await workspace(page, { failList: true, conflict: true });
  await expect(
    page.getByRole("alert").filter({ hasText: "temporarily unavailable" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry list" }).click();
  await create(page);
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await page.getByLabel("Campaign name").fill("Unsaved edits");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Reload it before saving" }),
  ).toBeVisible();
  await expect(page.getByLabel("Campaign name")).toHaveValue("Unsaved edits");
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Reload draft" }).click();
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await expect(page.getByLabel("Campaign name")).toHaveValue("Appointment reminders");
});
void test("admin schedules using the saved timestamp and timezone", async ({ page }) => {
  const { writes } = await workspace(page, { admin: true });
  await create(page);
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await page.getByRole("button", { name: "4 Schedule", exact: true }).click();
  await page.getByLabel("Delivery timing").selectOption("later");
  await page.getByLabel("Date and time (UTC)").fill("2030-01-01T03:30");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("button", { name: "Schedule delivery", exact: true })).toBeVisible();
  expect(writes.at(-1)?.scheduleTimezone).toBe("UTC");
  expect(writes.at(-1)?.scheduleAt).toBe("2030-01-01T03:30:00Z");
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Schedule delivery", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Campaign approval and delivery" })
      .getByText("scheduled", { exact: true }),
  ).toBeVisible();
});

void test("shows missing connection/template guidance and hides write actions for read-only members", async ({
  page,
}) => {
  await workspace(page, { emptyOptions: true, readOnly: true });
  await expect(
    page.getByText("A connected WhatsApp account is needed to save a campaign.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "New campaign" })).toHaveCount(0);
});

void test("member submits the saved campaign for review without gaining delivery controls", async ({
  page,
}) => {
  await workspace(page);
  await create(page);
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(
    page
      .getByRole("region", { name: "Campaign approval and delivery" })
      .getByText("pending", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Send now", exact: true })).toHaveCount(0);
});

void test("admin confirms delivery, pauses, resumes, cancels and reads the report", async ({
  page,
}) => {
  await workspace(page, { admin: true });
  await create(page);
  await expect(page.getByText("No recipients yet.", { exact: false })).toBeVisible();
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Send now", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Campaign approval and delivery" })
      .getByText("queued", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Cancel remaining", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Campaign approval and delivery" })
      .getByText("cancelled", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh report", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next recipients" })).toBeDisabled();
});
