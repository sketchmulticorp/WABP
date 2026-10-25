import { expect, test, type Page, type Route } from "@playwright/test";

interface MockContact {
  readonly consentStatus: string;
  readonly email: string | null;
  readonly id: string;
  readonly name: string | null;
  readonly phoneE164: string;
}

interface MockGroup {
  readonly id: string;
  readonly memberCount: number;
  readonly name: string;
}

/** Provides an authenticated tenant workspace without a real API, database, or credential. */
async function installWorkspaceApi(page: Page, initiallyAuthenticated = true): Promise<void> {
  const contacts: MockContact[] = [];
  const groups: MockGroup[] = [{ id: "group-1", memberCount: 0, name: "Appointment reminders" }];
  const members = new Map<string, MockContact[]>([["group-1", []]]);
  let authenticated = initiallyAuthenticated;

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const method = route.request().method();
    const body = requestJson(route);

    if (path === "/auth/refresh" && method === "POST") {
      return respond(
        route,
        authenticated ? { access_token: "test-access-token" } : undefined,
        authenticated ? 200 : 401,
      );
    }
    if (path === "/auth/login" && method === "POST") {
      authenticated = body?.email === "admin@example.test" && body?.password === "Password!123";
      return respond(
        route,
        authenticated ? { access_token: "test-access-token" } : undefined,
        authenticated ? 200 : 401,
      );
    }
    if (path === "/auth/logout" && method === "POST") {
      authenticated = false;
      return respond(route, { logged_out: true });
    }
    if (path === "/me" && method === "GET") {
      return respond(route, {
        display_name: "Test Clinic Admin",
        email: "admin@example.test",
        permissions: ["contact.read", "contact.write", "contact.delete", "contact.import"],
        role: { system_key: "TENANT_ADMIN" },
        tenant: { id: "tenant-1", name: "Test Clinic" },
      });
    }
    if (path === "/contacts" && method === "GET")
      return respond(route, { contacts, nextCursor: null });
    if (path === "/contacts" && method === "POST") {
      const contact = {
        consentStatus: "UNKNOWN",
        email: typeof body?.email === "string" ? body.email : null,
        id: `contact-${String(contacts.length + 1)}`,
        name: typeof body?.name === "string" ? body.name : null,
        phoneE164: String(body?.phone ?? "").replace(/^9876543210$/u, "+919876543210"),
      };
      contacts.push(contact);
      return respond(route, contact, 201);
    }
    if (path.startsWith("/contacts/") && method === "DELETE") {
      const id = path.split("/")[2];
      const index = contacts.findIndex((contact) => contact.id === id);
      if (index >= 0) contacts.splice(index, 1);
      return respond(route, { deleted: true, id });
    }
    if (path.endsWith("/consent") && method === "PATCH") {
      const id = path.split("/")[2];
      const contact = contacts.find((candidate) => candidate.id === id);
      if (contact !== undefined && typeof body?.status === "string") {
        const index = contacts.indexOf(contact);
        contacts[index] = { ...contact, consentStatus: body.status };
      }
      return respond(route, contact ?? {}, 200);
    }
    if (path === "/groups" && method === "GET") return respond(route, { groups });
    if (path === "/groups" && method === "POST") {
      const group = {
        id: `group-${String(groups.length + 1)}`,
        memberCount: 0,
        name: String(body?.name ?? ""),
      };
      groups.push(group);
      members.set(group.id, []);
      return respond(route, group, 201);
    }
    if (path.startsWith("/groups/") && path.endsWith("/members") && method === "GET") {
      return respond(route, { members: members.get(path.split("/")[2] ?? "") ?? [] });
    }
    if (path.startsWith("/groups/") && path.endsWith("/members") && method === "POST") {
      const groupId = path.split("/")[2] ?? "";
      const contactId = Array.isArray(body?.contact_ids) ? String(body.contact_ids[0]) : "";
      const contact = contacts.find((candidate) => candidate.id === contactId);
      if (contact !== undefined) {
        const current = members.get(groupId) ?? [];
        members.set(groupId, [...current, contact]);
        const groupIndex = groups.findIndex((group) => group.id === groupId);
        if (groupIndex >= 0)
          groups[groupIndex] = { ...groups[groupIndex], memberCount: current.length + 1 };
      }
      return respond(route, { added: contact === undefined ? 0 : 1, group_id: groupId });
    }
    if (path === "/contacts/imports" && method === "GET") return respond(route, []);
    if (path === "/contacts/imports" && method === "POST") {
      return respond(
        route,
        {
          completedAt: null,
          createdAt: "2026-10-11T00:00:00.000Z",
          errorCode: null,
          id: "import-1",
          insertedRows: 0,
          invalidRows: 0,
          originalFilename: "contacts.csv",
          status: "QUEUED",
          totalRows: 0,
        },
        201,
      );
    }
    if (path === "/contacts/imports/import-1" && method === "GET") {
      return respond(route, {
        completedAt: "2026-10-11T00:01:00.000Z",
        createdAt: "2026-10-11T00:00:00.000Z",
        errorCode: null,
        id: "import-1",
        insertedRows: 1,
        invalidRows: 0,
        originalFilename: "contacts.csv",
        status: "COMPLETED",
        totalRows: 1,
      });
    }
    return respond(route, {});
  });
}

void test("signs in and manages a Contact plus its consent", async ({ page }) => {
  await installWorkspaceApi(page, false);
  await page.goto("/");

  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("Password!123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();

  await page.getByLabel("Name").fill("Asha");
  await page.getByLabel("Phone").fill("9876543210");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("+919876543210")).toBeVisible();

  await page.getByRole("button", { name: "Consent" }).click();
  await page.getByLabel("Evidence reference (required for opt-in)").fill("intake-form-42");
  await page.getByRole("button", { name: "Save consent" }).click();
  await expect(page.getByText("OPTED_IN")).toBeVisible();
});

void test("shows a static Group and starts an asynchronous import", async ({ page }) => {
  await installWorkspaceApi(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Groups" }).click();
  await expect(page.getByRole("button", { name: "Appointment reminders" })).toBeVisible();

  await page.getByRole("button", { name: "Imports" }).click();
  await page.getByLabel("CSV or XLSX file").setInputFiles({
    mimeType: "text/csv",
    name: "contacts.csv",
    buffer: Buffer.from("phone,name\n9876543210,Asha\n"),
  });
  await page.getByRole("button", { name: "Start import" }).click();
  await expect(page.getByRole("heading", { name: "Import QUEUED" })).toBeVisible();
  await expect(page.getByText("contacts.csv")).toBeVisible();
});

async function respond(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({
    contentType: "application/json",
    status,
    body: JSON.stringify(
      status >= 400
        ? { error: { code: "TEST_ERROR", details: [], message: "Test error", retryable: false } }
        : { data, request_id: "playwright-test" },
    ),
  });
}

function requestJson(route: Route): Record<string, unknown> | null {
  if (!route.request().headers()["content-type"]?.includes("application/json")) return null;
  const raw = route.request().postData();
  if (raw === null) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}
