import { expect, test, type Page } from "@playwright/test";

test("storage-free preview exposes authoring navigation without background feature calls", async ({
  page,
}) => {
  const paths: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    paths.push(path);
    const data: unknown =
      path === "/auth/refresh"
        ? { access_token: "synthetic" }
        : path === "/me"
          ? {
              id: "preview-admin",
              email: "preview@example.test",
              display_name: "Preview Admin",
              deployment_mode: "preview",
              password_change_required: false,
              permissions: [
                "contact.read",
                "template.read",
                "campaign.read",
                "whatsapp.read",
                "conversation.read",
                "automation.read",
              ],
              role: { system_key: "TENANT_ADMIN", name: "Tenant Admin" },
              tenant: { id: "preview-tenant", name: "Test business" },
              subscription: null,
            }
          : path === "/campaigns/draft-options"
            ? { accounts: [], templates: [] }
            : path === "/campaigns"
              ? { campaigns: [], nextCursor: null }
              : path === "/contacts"
                ? { contacts: [], nextCursor: null }
                : [];
    return route.fulfill({ json: { data, request_id: "test" } });
  });
  await page.goto("/");
  await expect(
    page.getByText("Storage-free preview — setup, authoring and reporting"),
  ).toBeVisible();
  const sidebar = page.getByLabel("Workspace navigation");
  await expect(sidebar.getByRole("button", { name: "Inbox", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "Automations", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: "Imports", exact: true })).toHaveCount(0);
  for (const name of ["Templates", "WhatsApp setup", "Campaigns"]) {
    await sidebar.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".workspace-view-name")).toHaveText(name);
  }
  await expect(page.getByRole("button", { name: "Run preflight", exact: true })).toHaveCount(0);
  expect(paths.some((path) => /conversations|automation|imports|preflight/u.test(path))).toBe(
    false,
  );
});

/** Synthetic API only: these browser cases cannot change a real account or send messages. */
async function installApi(page: Page, failChange = false) {
  const requests: string[] = [];
  let authenticated = true;
  let changes = 0;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    requests.push(path);
    if (path === "/auth/refresh") {
      return route.fulfill({
        status: authenticated ? 200 : 401,
        json: { data: { access_token: "synthetic-token" }, request_id: "test" },
      });
    }
    if (path === "/auth/logout") {
      authenticated = false;
      return route.fulfill({ json: { data: { logged_out: true }, request_id: "test" } });
    }
    if (path === "/me") {
      return route.fulfill({
        json: {
          data: {
            id: "test-user",
            email: "user@example.test",
            display_name: "Test User",
            deployment_mode: "preview",
            password_change_required: true,
            permissions: [],
            role: { system_key: "TENANT_USER", name: "Tenant User" },
            tenant: null,
            subscription: null,
          },
          request_id: "test",
        },
      });
    }
    if (path === "/auth/change-initial-password") {
      changes++;
      const body: unknown = route.request().postDataJSON();
      expect(body).toEqual({
        current_password: "Temporary!Password123",
        new_password: "Replacement!Password456",
      });
      if (failChange) {
        return route.fulfill({
          status: 403,
          json: {
            error: {
              code: "CURRENT_PASSWORD_INVALID",
              message: "The temporary password is incorrect.",
              request_id: "test",
              retryable: false,
              details: [],
            },
          },
        });
      }
      authenticated = false;
      return route.fulfill({
        json: { data: { password_changed: true, login_required: true }, request_id: "test" },
      });
    }
    return route.fulfill({
      status: 500,
      json: { error: { message: "Unexpected workspace request" } },
    });
  });
  return { requests, changes: () => changes };
}

async function fill(page: Page, confirmation = "Replacement!Password456") {
  await page.getByLabel("Temporary password", { exact: true }).fill("Temporary!Password123");
  await page.getByLabel("New password", { exact: true }).fill("Replacement!Password456");
  await page.getByLabel("Confirm new password", { exact: true }).fill(confirmation);
}

test("pending account stays gated on reload and mismatch never reaches API", async ({ page }) => {
  const api = await installApi(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Choose your own password" })).toBeVisible();
  await fill(page, "Different!Password789");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "The new passwords do not match.",
  );
  expect(api.changes()).toBe(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Choose your own password" })).toBeVisible();
  expect(api.requests.every((path) => ["/auth/refresh", "/me"].includes(path))).toBe(true);
});

test("successful change shows fresh-login handover without mounting workspace", async ({
  page,
}) => {
  const api = await installApi(page);
  await page.goto("/");
  await fill(page);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Password changed", exact: true })).toBeVisible();
  await expect(page.getByLabel("Temporary password", { exact: true })).toHaveCount(0);
  expect(api.changes()).toBe(1);
  expect(
    api.requests.every((path) =>
      ["/auth/refresh", "/me", "/auth/change-initial-password"].includes(path),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Sign in with your new password" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("server error is actionable and sign-out exits the restricted screen", async ({ page }) => {
  await installApi(page, true);
  await page.goto("/");
  await fill(page);
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "The temporary password is incorrect.",
  );
  await expect(page.getByRole("button", { name: "Change password", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});
