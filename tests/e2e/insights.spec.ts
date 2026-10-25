import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const id = "10000000-0000-4000-8000-000000000001";
const period = { start: "2026-10-01T00:00:00Z", end: "2026-11-01T00:00:00Z" };
/** All requests are doubled: these tests exercise browser workflows, never live Meta/customer data. */
async function reports(page: Page, platform = false) {
  const requests: string[] = [],
    exports: Record<string, unknown>[] = [];
  const state = {
    failExport: false,
    holdExport: null as Promise<void> | null,
    dashboardFailure: false,
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname.replace("/api/v1", "");
    requests.push(path);
    const respond = (data: unknown) =>
      route.fulfill({ json: { data, request_id: "phase8-browser" } });
    if (path === "/auth/refresh") return respond({ access_token: "fixture" });
    if (path === "/me")
      return respond({
        id,
        email: "fixture@example.test",
        display_name: "Fixture",
        role: {
          name: platform ? "Super Admin" : "Admin",
          system_key: platform ? "SUPER_ADMIN" : "TENANT_ADMIN",
        },
        tenant: platform ? null : { id, name: "Fixture business" },
        permissions: [
          "contact.read",
          "report.read",
          "plan.read",
          "billing.read",
          "audit.read",
          ...(platform ? ["platform.dashboard.read", "tenant.read"] : []),
        ],
        subscription: null,
      });
    if (path === "/contacts") return respond({ contacts: [], nextCursor: null });
    if (path === "/reports/exports" || path === "/platform/reports/exports") {
      exports.push(request.postDataJSON() as Record<string, unknown>);
      if (state.holdExport !== null) await state.holdExport;
      if (state.failExport)
        return route.fulfill({
          status: 422,
          json: {
            error: {
              code: "REPORT_EXPORT_TOO_LARGE",
              message: "This report exceeds 10,000 rows or 10 MiB.",
            },
          },
        });
      return route.fulfill({
        contentType: "text/csv; charset=utf-8",
        body: '\uFEFF"metric","count"\r\n"contacts",2\r\n',
      });
    }
    if (path === "/dashboard" || path === "/platform/dashboard") {
      if (state.dashboardFailure)
        return route.fulfill({
          status: 503,
          json: { error: { code: "UNAVAILABLE", message: "Try again" } },
        });
      return respond({
        period,
        contacts: 2,
        groups: 1,
        campaigns: 3,
        openConversations: 1,
        outboundStatuses: [{ status: "READ", count: 4 }],
        ...(platform ? { tenantCount: 2, activeTenants: 2, tenantAdminCount: 2 } : {}),
      });
    }
    if (path === "/usage" || path.endsWith("/usage"))
      return respond({
        period,
        reservedMessages: 20,
        messageLimit: 100,
        remainingMessages: 80,
        ambiguousSubscription: false,
        subscription: null,
      });
    if (path.endsWith("/payments"))
      return respond({
        items: [
          {
            id,
            amountMinor: "100",
            currency: "INR",
            paidAt: period.start,
            reference: "ref",
            ...(platform ? { note: "PLATFORM_ONLY_NOTE" } : {}),
          },
        ],
        nextCursor: null,
      });
    if (path.endsWith("/audit-logs")) return respond({ items: [], nextCursor: null });
    if (path === "/platform/insights/businesses")
      return respond({
        items: [{ id, name: "Fixture business", status: "ACTIVE" }],
        nextCursor: null,
      });
    return route.fulfill({
      status: 404,
      json: { error: { code: "NOT_FOUND", message: "Unexpected fixture path" } },
    });
  });
  await page.goto("/");
  return { requests, exports, state };
}

test("tenant reports render and download the bounded CSV; oversized errors support retry", async ({
  page,
}) => {
  const f = await reports(page);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByText("Active Contacts", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export overview CSV" }).click();
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toBe("report-dashboard.csv");
  const downloadedPath = await downloaded.path();
  if (downloadedPath === null) throw new Error("Expected a local CSV download");
  expect(await readFile(downloadedPath, "utf8")).toContain('"contacts",2');
  expect(f.exports[0]).toEqual({ kind: "dashboard" });
  f.state.failExport = true;
  await page.getByRole("button", { name: "Export overview CSV" }).click();
  await expect(
    page.getByRole("region", { name: "Business overview" }).getByRole("alert"),
  ).toContainText("10,000 rows");
  f.state.failExport = false;
  const retry = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export overview CSV" }).click();
  await retry;
});
test("audit export uses applied filters, not unsaved values or pagination cursors", async ({
  page,
}) => {
  const f = await reports(page);
  await page.getByRole("button", { name: "Audit log", exact: true }).click();
  await expect(page.getByText("No matching audit records.")).toBeVisible();
  await page.getByLabel("Action (exact code)").fill("FIXTURE_EVENT");
  await page.getByRole("button", { name: "Search audit log" }).click();
  await page.getByLabel("Action (exact code)").fill("UNSAVED_CHANGE");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export filtered audit CSV" }).click();
  await download;
  const body = f.exports.at(-1);
  expect(body?.kind).toBe("audit");
  expect(body?.filters).toMatchObject({ action: "FIXTURE_EVENT" });
  expect(JSON.stringify(body)).not.toContain("cursor");
  expect(JSON.stringify(body)).not.toContain("UNSAVED_CHANGE");
});
test("leaving a report cancels its in-flight export without downloading obsolete data", async ({
  page,
}) => {
  const f = await reports(page);
  let resolve = () => undefined as void;
  f.state.holdExport = new Promise<void>((done) => {
    resolve = done;
  });
  let downloads = 0;
  page.on("download", () => {
    downloads++;
  });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Export overview CSV" }).click();
  await expect(page.getByRole("button", { name: "Preparing CSV…" })).toBeDisabled();
  await expect.poll(() => f.exports.length).toBe(1);
  await page.getByRole("button", { name: "Plan and usage", exact: true }).click();
  resolve();
  await expect(page.getByRole("button", { name: "Export usage CSV" })).toBeVisible();
  await page.getByRole("button", { name: "Refresh usage" }).click();
  expect(downloads).toBe(0);
});
test("platform reports stay metadata-only and never mount tenant-content screens", async ({
  page,
}) => {
  const f = await reports(page, true);
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export platform summary CSV" }).click();
  await download;
  expect(f.exports[0]).toEqual({ kind: "dashboard" });
  expect(f.requests).not.toContain("/contacts");
  expect(f.requests).not.toContain("/conversations");
  await page.getByRole("button", { name: "Fixture business · ACTIVE" }).click();
  await expect(page.getByRole("cell", { name: "PLATFORM_ONLY_NOTE" })).toBeVisible();
  const payments = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export payment history CSV" }).click();
  await payments;
  expect(f.exports.at(-1)).toEqual({ kind: "payments", businessId: id });
});
