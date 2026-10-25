import { expect, test, type Page, type Route } from "@playwright/test";

// All feature requests terminate here: these tests never contact Meta or a database.
async function fixture(
  page: Page,
  options: { user?: boolean; empty?: boolean; failSave?: boolean } = {},
) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const account = {
    id: "account-1",
    businessId: null,
    displayName: "Test clinic",
    displayPhone: "+919876543210",
    status: "CONNECTED",
    isDefault: true,
    phoneNumberId: "123456",
    wabaId: "654321",
    lastSyncedAt: null,
    health: { source: "development_manual_connection" },
  };
  const base = {
    whatsappAccountId: account.id,
    language: "en_US",
    category: "UTILITY",
    components: [{ type: "BODY", text: "Hello {{1}} <script>sample</script>" }],
    contentVersion: 3,
    approvalStatus: "DRAFT",
    approvalRequestedBy: null,
    approvalRejectionReason: null,
    rejectionReason: null,
    updatedAt: "2026-10-18T00:00:00Z",
    providerTemplateId: null,
    providerStatus: "DRAFT",
  };
  let templates = options.empty
    ? []
    : [
        { ...base, id: "local-1", name: "local_notice" },
        {
          ...base,
          id: "synced-1",
          name: "synced_notice",
          providerTemplateId: "provider-1",
          providerStatus: "APPROVED",
        },
        {
          ...base,
          id: "pending-1",
          name: "pending_notice",
          approvalStatus: "PENDING",
          approvalRequestedBy: "other-user",
        },
      ];
  let accounts = options.empty ? [] : [account];
  await page.route("**/api/v1/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method();
    const body = route.request().postDataJSON() as Record<string, unknown> | null;
    if (method !== "GET") writes.push({ path, body: body ?? {} });
    const send = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(
          status >= 400
            ? {
                error: {
                  code: "VERSION_CONFLICT",
                  message: "Saved version changed; reload before editing.",
                  details: [],
                  retryable: false,
                },
              }
            : { data, request_id: "mock-setup" },
        ),
      });
    if (path === "/auth/refresh") return send({ access_token: "mock-token" });
    if (path === "/whatsapp/onboarding")
      return send({ mode: "development", connection_available: true, status: "DEVELOPMENT_ONLY" });
    if (path === "/me")
      return send({
        id: "reviewer",
        display_name: "Test reviewer",
        role: { system_key: options.user ? "TENANT_USER" : "TENANT_ADMIN" },
        tenant: { id: "tenant-1", name: "Test clinic" },
        permissions: [
          "contact.read",
          "template.read",
          "template.write",
          "template.approve",
          "template.sync",
          "whatsapp.read",
          "whatsapp.connect",
          "whatsapp.sync",
          "whatsapp.disconnect",
        ],
      });
    if (path === "/contacts") return send({ contacts: [], nextCursor: null });
    if (path === "/whatsapp/accounts" && method === "GET") return send(accounts);
    if (path === "/templates" && method === "GET") return send(templates);
    if (path.endsWith("/preview"))
      return send({
        preview: { header: null, body: "Hello {{1}} <script>sample</script>", footer: null },
      });
    if (path === "/templates/sync") return send({ synchronized: templates.length, templates });
    if (path.startsWith("/templates/") && method === "POST") {
      templates = templates.map((row) =>
        row.id === path.split("/")[2]
          ? {
              ...row,
              approvalStatus: path.endsWith("request-approval")
                ? "PENDING"
                : path.endsWith("reject")
                  ? "REJECTED"
                  : "APPROVED",
            }
          : row,
      );
      return send(templates.find((row) => row.id === path.split("/")[2]));
    }
    if (path.startsWith("/templates") && (method === "POST" || method === "PATCH")) {
      if (options.failSave) return send(null, 409);
      const row = {
        ...base,
        ...body,
        id: method === "POST" ? "created-1" : path.split("/")[2],
        name: String(body?.name),
        contentVersion: method === "POST" ? 1 : 4,
      };
      templates = [...templates.filter((value) => value.id !== row.id), row];
      return send(row);
    }
    if (path === "/whatsapp/connect") {
      accounts = [account];
      return send(account);
    }
    if (path.endsWith("/sync")) return send(account);
    if (method === "DELETE") {
      accounts = [{ ...account, status: "DISCONNECTED" }];
      return send({ disconnected: true });
    }
    return send({});
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  return writes;
}

async function open(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1440) < 769)
    await page.getByRole("button", { name: /open navigation/i }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("template library filters, escaped preview and synced read-only protection", async ({
  page,
}) => {
  const writes = await fixture(page);
  await open(page, "Templates");
  await page.getByRole("button", { name: /synced_notice/ }).click();
  await expect(page.getByLabel("Saved template preview")).toContainText("<script>sample</script>");
  await expect(page.getByRole("button", { name: "Edit local draft" })).toHaveCount(0);
  await page.getByLabel("Search templates").fill("missing");
  await expect(page.getByText("No templates match these filters.")).toBeVisible();
  expect(writes.filter((row) => !row.path.startsWith("/auth"))).toEqual([]);
});

test("new text template uses existing snake-case contract and optional components", async ({
  page,
}) => {
  const writes = await fixture(page);
  await open(page, "Templates");
  await page.getByRole("button", { name: "New template" }).click();
  await page
    .getByRole("combobox", { name: "Sending account", exact: true })
    .selectOption("account-1");
  await page.getByLabel("Template name").fill("appointment_notice");
  await page.getByLabel("Header (optional)").fill("Reminder");
  await page.getByLabel("Message body").fill("Hello {{1}}");
  await page.getByLabel("Footer (optional)").fill("Clinic");
  await expect(page.getByLabel("Draft message preview")).toContainText("Hello {{1}}");
  await expect(page.getByRole("button", { name: "Sync from Meta" })).toBeDisabled();
  await page.getByRole("button", { name: "Save local draft" }).click();
  await expect(
    page.getByText("Local template saved. Nothing submitted to Meta or sent."),
  ).toBeVisible();
  expect(writes.find((row) => row.path === "/templates")?.body).toEqual({
    name: "appointment_notice",
    language: "en_US",
    category: "UTILITY",
    whatsapp_account_id: "account-1",
    components: [
      { type: "HEADER", format: "TEXT", text: "Reminder" },
      { type: "BODY", text: "Hello {{1}}" },
      { type: "FOOTER", text: "Clinic" },
    ],
  });
});

test("version conflict retains draft and cancelled navigation keeps input", async ({ page }) => {
  const writes = await fixture(page, { failSave: true });
  await open(page, "Templates");
  await page.getByRole("button", { name: /local_notice/ }).click();
  await page.getByRole("button", { name: "Edit local draft" }).click();
  await page.getByLabel("Message body").fill("Changed content");
  await page.getByRole("button", { name: "Save local draft" }).click();
  await expect(page.locator(".templates-workspace").getByRole("alert")).toContainText(
    "Saved version changed",
  );
  expect(
    writes.find((row) => row.path === "/templates/local-1")?.body.expected_content_version,
  ).toBe(3);
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(page.getByLabel("Message body")).toHaveValue("Changed content");
});

test("saved-version Admin review requires confirmation and rejection reason", async ({ page }) => {
  const writes = await fixture(page);
  await open(page, "Templates");
  await page.getByRole("button", { name: /pending_notice/ }).click();
  await expect(page.getByRole("button", { name: "Reject saved version" })).toBeDisabled();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Approve saved version" }).click();
  await expect(
    page.getByText("Internal review updated. Meta approval is unchanged."),
  ).toBeVisible();
  expect(writes.find((row) => row.path.endsWith("/approve"))?.body.expected_content_version).toBe(
    3,
  );
});

test("User can request internal review but cannot operate account controls", async ({ page }) => {
  const writes = await fixture(page, { user: true });
  await open(page, "Templates");
  await page.getByRole("button", { name: /local_notice/ }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Request Admin review" }).click();
  await expect(
    page.getByText("Internal review updated. Meta approval is unchanged."),
  ).toBeVisible();
  expect(writes.some((row) => row.path.endsWith("/request-approval"))).toBe(true);
  await open(page, "WhatsApp setup");
  await expect(page.getByRole("button", { name: "Sync account" })).toHaveCount(0);
  await expect(page.getByLabel("Development WhatsApp setup")).toHaveCount(0);
});

test("empty account blocks template save and mapping contains reference not token", async ({
  page,
}) => {
  const writes = await fixture(page, { empty: true });
  await open(page, "Templates");
  await page.getByRole("button", { name: "New template" }).click();
  await expect(page.getByRole("button", { name: "Save local draft" })).toBeDisabled();
  await page.getByRole("button", { name: "Close editor" }).click();
  await open(page, "WhatsApp setup");
  const form = page.getByLabel("Development WhatsApp setup", { exact: true });
  await form.getByLabel("WABA ID", { exact: true }).fill("654321");
  await form.getByLabel("Phone number ID", { exact: true }).fill("123456");
  await form.getByLabel("Display phone number").fill("+919876543210");
  page.once("dialog", (dialog) => void dialog.accept());
  await form.getByRole("button", { name: "Save development mapping" }).click();
  await expect(page.getByText("Not verified with Meta yet")).toBeVisible();
  expect(writes.find((row) => row.path === "/whatsapp/connect")?.body).toEqual({
    business_id: null,
    display_name: null,
    display_phone: "+919876543210",
    phone_number_id: "123456",
    waba_id: "654321",
    secret_ref: "env://META_DEVELOPMENT_ACCESS_TOKEN",
  });
  expect(writes.some((row) => row.path.endsWith("/sync"))).toBe(false);
});

test("account sync/disconnect are explicit, cancellation is non-mutating", async ({ page }) => {
  const writes = await fixture(page);
  await open(page, "WhatsApp setup");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "Sync account" }).click();
  expect(writes.some((row) => row.path.endsWith("/sync"))).toBe(false);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Sync account" }).click();
  await expect(
    page.getByText(
      "Account metadata synchronized. Template synchronization is separate in Templates.",
    ),
  ).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Disconnect locally" }).click();
  await expect(page.getByRole("button", { name: "Sync account" })).toBeDisabled();
  expect(writes.some((row) => row.path === "/whatsapp/accounts/account-1")).toBe(true);
});

test("template sync only runs after confirmation with the selected account", async ({ page }) => {
  const writes = await fixture(page);
  await open(page, "Templates");
  await page.getByRole("combobox", { name: "Account to synchronize" }).selectOption("account-1");
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.getByRole("button", { name: "Sync from Meta" }).click();
  expect(writes.some((row) => row.path === "/templates/sync")).toBe(false);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Sync from Meta" }).click();
  await expect(page.getByText("3 templates synchronized from Meta.")).toBeVisible();
  expect(writes.find((row) => row.path === "/templates/sync")?.body).toEqual({
    whatsapp_account_id: "account-1",
  });
});

test("preview failure retries and account failure does not hide the template library", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/v1/whatsapp/accounts", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "UNAVAILABLE", message: "Unavailable", retryable: true, details: [] },
      }),
    }),
  );
  let fail = true;
  await page.route("**/api/v1/templates/*/preview", (route) =>
    route.fulfill({
      status: fail ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        fail
          ? {
              error: {
                code: "UNAVAILABLE",
                message: "Preview unavailable",
                retryable: true,
                details: [],
              },
            }
          : { data: { preview: { header: null, body: "Recovered preview", footer: null } } },
      ),
    }),
  );
  await open(page, "Templates");
  await page.getByRole("button", { name: /local_notice/ }).click();
  await expect(
    page.getByText("Sending accounts could not be loaded. Refresh to retry."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry preview" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry preview" }).click();
  await expect(page.getByLabel("Saved template preview")).toContainText("Recovered preview");
});

for (const width of [375, 768, 1440])
  test(`setup screens fit ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page);
    for (const name of ["Templates", "WhatsApp setup"]) {
      await open(page, name);
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  });
