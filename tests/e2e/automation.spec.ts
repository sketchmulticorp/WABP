import { test, expect, type Page } from "@playwright/test";
import type { AutomationDetail } from "@whatsapp-platform/contracts";

const id = "00000000-0000-4000-8000-000000000001",
  accountId = "00000000-0000-4000-8000-000000000002";
async function workspace(page: Page, readonly = false) {
  const flow: AutomationDetail = {
    id,
    name: "Clinic welcome",
    status: "DRAFT",
    updatedAt: new Date().toISOString(),
    publishedVersionId: null,
    revision: "a".repeat(64),
    versions: [
      {
        id: accountId,
        number: 1,
        status: "DRAFT",
        publishedAt: null,
        graph: {
          accountId,
          keywords: ["hello"],
          nodes: [
            { key: "start", type: "START", config: {} },
            { key: "message", type: "MESSAGE", config: { text: "Private welcome text" } },
            { key: "end", type: "END", config: {} },
          ],
          edges: [
            { from: "start", to: "message", choice: null },
            { from: "message", to: "end", choice: null },
          ],
        },
      },
    ],
  };
  const state = { failSave: false, deny: false, writes: [] as string[] };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const send = (data: unknown) =>
      route.fulfill({ json: { data, request_id: "automation-browser" } });
    const error = (status: number, code: string) =>
      route.fulfill({
        status,
        json: {
          error: {
            code,
            message: code,
            request_id: "automation-browser",
            retryable: false,
            details: [],
          },
        },
      });
    if (path === "/auth/refresh") return send({ access_token: "fake-browser-token" });
    if (path === "/me")
      return send({
        id,
        display_name: "Owner",
        email: "fixture@example.test",
        role: { system_key: readonly ? "TENANT_USER" : "TENANT_ADMIN", name: "Fixture" },
        tenant: { id, name: "Clinic" },
        permissions: [
          "automation.read",
          "automation.test",
          ...(readonly ? [] : ["automation.write", "automation.publish"]),
        ],
        subscription: null,
      });
    if (path === "/contacts") return send({ contacts: [], nextCursor: null });
    if (path.startsWith("/automations") && state.deny) return error(403, "FORBIDDEN");
    if (path === "/automations/options")
      return send({
        accounts: [{ id: accountId, label: "Test account", status: "CONNECTED" }],
        members: [],
        accountCursor: null,
        memberCursor: null,
      });
    if (route.request().method() === "GET") {
      if (path === "/automations") return send({ automations: [flow], nextCursor: null });
      if (path === `/automations/${id}`) return send(flow);
    }
    if (path.startsWith("/automations") && route.request().method() !== "GET") {
      state.writes.push(path);
      if (path.endsWith("/test"))
        return send({
          valid: true,
          errors: [],
          steps: [
            { key: "start", type: "START" },
            { key: "message", type: "MESSAGE" },
            { key: "end", type: "END" },
          ],
          outcome: "COMPLETED",
        });
      if (state.failSave) return error(409, "AUTOMATION_REVISION_CHANGED");
      if (path === "/automations" || path === `/automations/${id}`) {
        const input = route.request().postDataJSON() as {
          name: string;
          graph: AutomationDetail["versions"][number]["graph"];
        };
        flow.name = input.name;
        flow.versions = [
          { id: accountId, number: 1, status: "DRAFT", publishedAt: null, graph: input.graph },
        ];
      }
      if (path.endsWith("/publish")) {
        flow.status = "ACTIVE";
        flow.publishedVersionId = accountId;
        flow.versions = flow.versions.map((v) => ({ ...v, status: "PUBLISHED" }));
      }
      return send(flow);
    }
    return error(404, "UNEXPECTED_FIXTURE_ROUTE");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Automations", exact: true }).click();
  await page.getByRole("button", { name: "Clinic welcome · DRAFT", exact: true }).click();
  return state;
}

test("readable history and simulator do not call a delivery endpoint", async ({ page }) => {
  const state = await workspace(page);
  await page.getByText("Read-only steps", { exact: true }).click();
  await expect(page.getByText("Private welcome text", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start simulation" }).click();
  await expect(page.getByRole("status")).toContainText("COMPLETED — no messages sent");
  expect(state.writes).toEqual([`/automations/${id}/test`]);
});

test("create and publish a saved draft through accessible form controls without sending", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.getByRole("button", { name: "Create automation", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("New clinic flow");
  await page.getByRole("combobox", { name: /WhatsApp account/u }).selectOption(accountId);
  await page.getByLabel("Trigger keywords (one whole message per line)").fill("appointment");
  await page.getByRole("button", { name: "Save draft", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "New clinic flow · DRAFT", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Publish saved draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "New clinic flow · ACTIVE", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Current publication/u)).toBeVisible();
  expect(state.writes).toEqual(["/automations", `/automations/${id}/publish`]);
});
test("mobile draft preserves input after a stale-save conflict and publication requires confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await workspace(page);
  state.failSave = true;
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Unsaved clinic changes");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "AUTOMATION_REVISION_CHANGED" }),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Unsaved clinic changes");
  await expect(page.getByRole("button", { name: "Publish saved draft" })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel editing", exact: true }).click();
  state.failSave = false;
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Publish saved draft" }).click();
  expect(state.writes.some((path) => path.endsWith("/publish"))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test("read-only user has simulation but no authoring or publication controls", async ({ page }) => {
  await workspace(page, true);
  await expect(page.getByRole("button", { name: "Start simulation" })).toBeVisible();
  for (const name of ["Edit draft", "Create automation", "Publish saved draft"])
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
});
test("terminal authorization failure clears protected history and editor state", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.getByText("Read-only steps", { exact: true }).click();
  await expect(page.getByText("Private welcome text", { exact: true })).toBeVisible();
  state.deny = true;
  await page.getByRole("button", { name: "Reload saved version" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "FORBIDDEN" })).toBeVisible();
  await expect(page.getByText("Private welcome text", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Version history" })).toHaveCount(0);
});
