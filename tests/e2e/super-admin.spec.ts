import { expect, test, type Page } from "@playwright/test";

async function install(
  page: Page,
  options: {
    tenant?: boolean;
    pending?: boolean;
    permission?: boolean;
    conflict?: boolean;
    hold?: Promise<void>;
  } = {},
) {
  const posts: unknown[] = [];
  const paths: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    paths.push(path);
    const respond = (data: unknown) => route.fulfill({ json: { data, request_id: "synthetic" } });
    if (path === "/auth/refresh") return respond({ access_token: "synthetic" });
    if (path === "/auth/logout") return respond({ logged_out: true });
    if (path === "/me")
      return respond({
        id: "synthetic-owner",
        display_name: "Owner",
        email: "owner@example.test",
        deployment_mode: "preview",
        password_change_required: options.pending === true,
        permissions: options.pending || options.permission === false ? [] : ["user.invite"],
        role: {
          system_key: options.tenant ? "TENANT_ADMIN" : "SUPER_ADMIN",
          name: options.tenant ? "Tenant Admin" : "Super Admin",
        },
        tenant: options.tenant ? { id: "tenant", name: "Clinic" } : null,
        subscription: null,
      });
    if (path === "/contacts") return respond({ contacts: [], nextCursor: null });
    if (path === "/platform/super-admins") {
      posts.push(route.request().postDataJSON() as unknown);
      if (options.hold) await options.hold;
      if (options.conflict)
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: "SUPER_ADMIN_EMAIL_UNAVAILABLE",
              message: "This email is unavailable. No existing account was changed.",
            },
          },
        });
      return respond({
        user: {
          id: "new-partner",
          display_name: "Partner",
          email: "partner@example.test",
          role: "SUPER_ADMIN",
          status: "ACTIVE",
          password_change_required: true,
        },
      });
    }
    if (path === "/auth/change-initial-password")
      return respond({ password_changed: true, login_required: true });
    return route.fulfill({
      status: 500,
      json: { error: { message: `Unexpected test path ${path}` } },
    });
  });
  return { posts, paths };
}
async function open(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Platform overview", exact: true }),
  ).toBeAttached();
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByLabel("Platform navigation")
    .getByRole("button", { name: "Add Super Admin", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Add Super Admin", exact: true })).toBeVisible();
}
async function fill(page: Page) {
  await page.getByLabel("Full name", { exact: true }).fill("Partner");
  await page.getByLabel("Email", { exact: true }).fill("partner@example.test");
  await page.getByLabel("Temporary password", { exact: true }).fill("Temporary!Password123");
}
for (const width of [1280, 390]) {
  test(`creates partner with explicit confirmation and clears password at width ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const api = await install(page);
    await open(page);
    await fill(page);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Create Super Admin", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("was created as Super Admin");
    await expect(page.getByLabel("Temporary password", { exact: true })).toHaveValue("");
    expect(api.posts).toEqual([
      {
        display_name: "Partner",
        email: "partner@example.test",
        initial_password: "Temporary!Password123",
      },
    ]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
test("cancel, conflict and unsaved navigation retain safe retry state", async ({ page }) => {
  const api = await install(page, { conflict: true });
  await open(page);
  await fill(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Create Super Admin", exact: true }).click();
  expect(api.posts).toHaveLength(0);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Overview and billing", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add Super Admin", exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Create Super Admin", exact: true }).click();
  await expect(page.getByRole("region").getByRole("alert")).toHaveText(
    "This email is unavailable. No existing account was changed.",
  );
  await expect(page.getByRole("button", { name: "Create Super Admin", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Clear form", exact: true }).click();
  await expect(page.getByLabel("Temporary password", { exact: true })).toHaveValue("");
});
test("saving disables duplicate submit until response", async ({ page }) => {
  let release: () => void = () => undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const api = await install(page, { hold });
  await open(page);
  await fill(page);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Create Super Admin", exact: true }).click();
  await expect(page.getByRole("button", { name: "Creating…", exact: true })).toBeDisabled();
  expect(api.posts).toHaveLength(1);
  release();
  await expect(page.getByRole("status")).toContainText("was created");
});
for (const options of [{ tenant: true }, { permission: false }]) {
  test(`creation navigation hidden for ${JSON.stringify(options)}`, async ({ page }) => {
    const api = await install(page, options);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "My profile", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Super Admin", exact: true })).toHaveCount(0);
    expect(api.posts).toHaveLength(0);
  });
}
test("pending partner sees only handover, then fresh sign-in", async ({ page }) => {
  const api = await install(page, { pending: true });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Choose your own password", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Super Admin", exact: true })).toHaveCount(0);
  await page.getByLabel("Temporary password", { exact: true }).fill("Temporary!Password123");
  await page.getByLabel("New password", { exact: true }).fill("Replacement!Password456");
  await page.getByLabel("Confirm new password", { exact: true }).fill("Replacement!Password456");
  await page.getByRole("button", { name: "Change password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Password changed", exact: true })).toBeVisible();
  expect(
    api.paths.every((path) =>
      ["/auth/refresh", "/me", "/auth/change-initial-password"].includes(path),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Sign in with your new password", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to your workspace", exact: false }),
  ).toBeVisible();
});
