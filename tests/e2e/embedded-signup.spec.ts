import { expect, test, type Page } from "@playwright/test";

async function install(page: Page, mode: "development" | "embedded_signup", configured = true) {
  const completions: unknown[] = [];
  await page.route("https://connect.facebook.net/en_US/sdk.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.FB={init:function(){},login:function(callback){callback({authResponse:{code:'synthetic-code'}})}};`,
    }),
  );
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    let data: unknown = [];
    if (path === "/auth/refresh") data = { access_token: "synthetic" };
    else if (path === "/me")
      data = {
        id: "admin",
        email: "admin@example.test",
        display_name: "Admin",
        deployment_mode: "preview",
        permissions: ["contact.read", "whatsapp.read", "whatsapp.connect"],
        role: { name: "Tenant Admin", system_key: "TENANT_ADMIN" },
        tenant: { id: "tenant", name: "Test business" },
        subscription: null,
      };
    else if (path === "/contacts") data = { contacts: [], nextCursor: null };
    else if (path === "/whatsapp/onboarding")
      data = {
        mode,
        connection_available: mode === "development" || configured,
        status:
          mode === "development"
            ? "DEVELOPMENT_ONLY"
            : configured
              ? "READY_TO_CONNECT"
              : "NOT_CONFIGURED",
      };
    else if (path === "/whatsapp/onboarding/start")
      data = {
        attemptId: "00000000-0000-4000-8000-000000000001",
        nonce: "n".repeat(43),
        appId: "1234",
        configurationId: "5678",
        graphApiVersion: "v99.0",
        expiresInSeconds: 600,
      };
    else if (path === "/whatsapp/onboarding/complete") {
      completions.push(route.request().postDataJSON() as unknown);
      data = { accountId: "account", connected: true, messagingActivationPerformed: false };
    }
    return route.fulfill({ json: { data, request_id: "test" } });
  });
  await page.goto("/");
  await page
    .getByLabel("Workspace navigation")
    .getByRole("button", { name: "WhatsApp setup", exact: true })
    .click();
  return completions;
}

test("development retains mapping and unconfigured embedded mode fails closed", async ({
  page,
}) => {
  await install(page, "development");
  await expect(page.getByRole("button", { name: "Save development mapping" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare Meta connection" })).toHaveCount(0);
});
test("missing embedded configuration hides both manual and SDK actions", async ({ page }) => {
  await install(page, "embedded_signup", false);
  await expect(page.getByText(/server configuration is incomplete/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save development mapping" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Prepare Meta connection" })).toHaveCount(0);
});
test("explicit SDK signup ignores foreign events and submits only one verified-hint completion", async ({
  page,
}) => {
  const completions = await install(page, "embedded_signup");
  await page.getByRole("button", { name: "Prepare Meta connection" }).click();
  await page.getByRole("button", { name: "Continue with Meta" }).click();
  const event = {
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH",
    data: { waba_id: "100", phone_number_id: "200" },
  };
  await page.evaluate(
    (data) =>
      window.dispatchEvent(
        new MessageEvent("message", { origin: "https://attacker.example", data }),
      ),
    event,
  );
  expect(completions).toHaveLength(0);
  await page.evaluate((data) => {
    window.dispatchEvent(new MessageEvent("message", { origin: "https://www.facebook.com", data }));
    window.dispatchEvent(new MessageEvent("message", { origin: "https://www.facebook.com", data }));
  }, event);
  await expect(
    page.getByText("Meta access verified and connection saved. Messaging activation is separate."),
  ).toBeVisible();
  expect(completions).toEqual([
    {
      attemptId: "00000000-0000-4000-8000-000000000001",
      nonce: "n".repeat(43),
      code: "synthetic-code",
      wabaId: "100",
      phoneNumberId: "200",
    },
  ]);
});
