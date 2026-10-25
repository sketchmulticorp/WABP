import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import type { AuthorizationContext } from "../authorization/authorization.types.js";
import { TenantScopeService } from "../authorization/authorization.service.js";
import { TenantInsightsService } from "./tenant-insights.service.js";
import type { TenantInsightsRepository } from "./tenant-insights.repository.js";
import { PlatformInsightsService } from "./platform-insights.service.js";
import type { PlatformInsightsRepository } from "./platform-insights.repository.js";
import type { PlatformRepository } from "../platform/platform.repository.js";
import { insightCursor, parseInsightQuery } from "./insights.dto.js";
import { insightPage, usageSummary, currentMonth } from "./insights.presentation.js";
import type { SubscriptionProjection } from "./insights.types.js";
import { parseReportExport } from "./exports/report-export.dto.js";
import { EXPORT_MAX_BYTES, EXPORT_MAX_ROWS, serializeReport } from "./exports/report-csv.js";
import { paymentsCsv, auditCsv } from "./exports/report-projections.js";
import { ReportExportService } from "./exports/report-export.service.js";
import type { ReportExportRepository } from "./exports/report-export.repository.js";
import { PlatformReportExportService } from "./exports/platform-report-export.service.js";

const context: AuthorizationContext = {
  actorId: randomUUID(),
  email: "fixture@example.test",
  isPlatformActor: false,
  permissions: new Set(),
  requestId: "phase8-unit",
  roleId: randomUUID(),
  roleName: "Admin",
  roleSystemKey: "TENANT_ADMIN",
  sessionId: randomUUID(),
  tenantId: randomUUID(),
};
const forbidden = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "FORBIDDEN";
const tooLarge = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "REPORT_EXPORT_TOO_LARGE";

void test("CSV quotes commas/newlines/double quotes, preserves Unicode and emits BOM/CRLF", () => {
  assert.equal(
    serializeReport({ headers: ["name", "value"], rows: [['A,"B"', "తెలుగు\nline"]] }).toString(),
    '\uFEFF"name","value"\r\n"A,""B""","తెలుగు\nline"\r\n',
  );
  assert.equal(
    serializeReport({ headers: ["empty"], rows: [[null]] }).toString(),
    '\uFEFF"empty"\r\n""\r\n',
  );
});
void test("CSV neutralizes spreadsheet prefixes after hidden characters and retains phones as text", () => {
  for (const value of [
    "=SUM(1,2)",
    "+919876543210",
    "-2",
    "@cmd",
    " \t=cmd",
    "\u200B+cmd",
    "\rplain",
    "\nplain",
    "\tplain",
  ])
    assert.ok(
      serializeReport({ headers: ["x"], rows: [[value]] })
        .toString()
        .split("\r\n")[1]
        ?.startsWith("\"'"),
    );
});
void test("CSV row and exact encoded-byte boundaries fail without truncation", () => {
  const headers = ["x"],
    rows = Array.from({ length: EXPORT_MAX_ROWS }, () => [""]);
  assert.doesNotThrow(() => serializeReport({ headers, rows }));
  assert.throws(() => serializeReport({ headers, rows: [...rows, [""]] }), tooLarge);
  const count = EXPORT_MAX_BYTES - Buffer.byteLength('\uFEFF"x"\r\n') - 4;
  assert.equal(serializeReport({ headers, rows: [["a".repeat(count)]] }).length, EXPORT_MAX_BYTES);
  assert.throws(() => serializeReport({ headers, rows: [["a".repeat(count + 1)]] }), tooLarge);
  assert.throws(
    () => serializeReport({ headers, rows: [["తెలుగు".repeat(EXPORT_MAX_BYTES / 6)]] }),
    tooLarge,
  );
  assert.throws(() => serializeReport({ headers, rows: [["x", "bad"]] }), /column mapping/u);
});
void test("report filters reject impossible calendars, broad ranges, injection-shaped/unknown/array inputs", () => {
  for (const raw of [
    { from: "2026-02-30T00:00:00Z" },
    { from: "2020-01-01T00:00:00Z", to: "2026-01-01T00:00:00Z" },
    { action: "x' OR 1=1" },
    { tenantId: randomUUID() },
    { result: ["SUCCESS"] },
    { limit: "101" },
    { cursor: "not-json" },
    { to: "2026-10-17T25:00:00Z" },
  ])
    assert.throws(() => parseInsightQuery(raw, "audit"));
  const parsed = parseInsightQuery(
    { from: "2026-01-01T00:00:00Z", to: "2026-04-01T00:00:00Z", action: "REPORT_EXPORT_PREPARED" },
    "audit",
  );
  assert.equal(parsed.limit, 50);
});
void test("opaque pagination preserves microsecond tie-breakers and never accepts limit/cursor in exports", () => {
  const at = "2026-10-17 12:30:00.123456+00",
    id = randomUUID();
  const encoded = insightCursor(at, id);
  assert.deepEqual(parseInsightQuery({ cursor: encoded }, "page").cursor, { at, id });
  const page = insightPage(
    [
      { at, id },
      { at, id: randomUUID() },
    ],
    1,
    (row) => row,
  );
  assert.equal(page.nextCursor, encoded);
  for (const filters of [{ cursor: encoded }, { limit: "1" }])
    assert.throws(() => parseReportExport({ kind: "audit", filters }));
});
void test("export bodies reject scope/kind overrides and enforce exact required UUIDs", () => {
  for (const raw of [
    null,
    [],
    { kind: "unknown" },
    { kind: "usage", businessId: randomUUID() },
    { kind: "campaign-summary" },
    { kind: "campaign-recipients", campaignId: "invalid" },
    { kind: "audit", filters: { tenantId: randomUUID() } },
  ])
    assert.throws(() => parseReportExport(raw));
  assert.throws(() =>
    parseReportExport({ kind: "campaign-summary", campaignId: randomUUID() }, true),
  );
  assert.throws(() => parseReportExport({ kind: "payments" }, true));
  assert.equal(
    parseReportExport({ kind: "payments", businessId: randomUUID() }, true).kind,
    "payments",
  );
});
void test("usage distinguishes absent/invalid/overlapping/ineligible plans and exhausted quota", () => {
  const period = currentMonth();
  assert.equal(usageSummary(period, { reserved: 0, subscription: undefined }).messageLimit, null);
  const s: SubscriptionProjection = {
    status: "ACTIVE",
    startsAt: period.start,
    endsAt: null,
    planName: "Fixture",
    planCode: "FIXTURE",
    planStatus: "ACTIVE",
    eligible: true,
    eligibleCount: 1,
    limits: { monthly_message_limit: 10 },
  };
  assert.equal(usageSummary(period, { reserved: 12, subscription: s }).remainingMessages, 0);
  for (const value of ["10", -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null])
    assert.equal(
      usageSummary(period, {
        reserved: 0,
        subscription: { ...s, limits: { monthly_message_limit: value } },
      }).messageLimit,
      null,
    );
  assert.equal(
    usageSummary(period, { reserved: 0, subscription: { ...s, eligible: false } }).messageLimit,
    null,
  );
  assert.equal(
    usageSummary(period, { reserved: 0, subscription: { ...s, eligibleCount: 2 } }).subscription
      ?.eligible,
    false,
  );
  assert.equal(
    usageSummary(period, {
      reserved: 0,
      subscription: { ...s, limits: { monthly_message_limit: 0 } },
    }).messageLimit,
    0,
  );
});
void test("tenant service rejects every missing permission and platform context before persistence", async () => {
  const unreachable = () => {
    throw new Error("Persistence must not be reached");
  };
  const repository = {
    dashboard: unreachable,
    usage: unreachable,
    payments: unreachable,
    audit: unreachable,
  } as unknown as TenantInsightsRepository;
  const service = new TenantInsightsService(repository, new TenantScopeService());
  const query = parseInsightQuery({}, "page");
  assert.throws(() => service.dashboard(context), forbidden);
  await assert.rejects(service.usage(context), forbidden);
  await assert.rejects(service.payments(context, query), forbidden);
  await assert.rejects(service.audit(context, query), forbidden);
  assert.throws(
    () =>
      service.dashboard({
        ...context,
        permissions: new Set(["report.read"]),
        isPlatformActor: true,
        roleSystemKey: "SUPER_ADMIN",
        tenantId: null,
      }),
    forbidden,
  );
});
void test("platform use case rejects tenant actors and absent operation permission", async () => {
  const unavailable = new Proxy(
    {},
    {
      get() {
        throw new Error("Persistence must not be reached");
      },
    },
  );
  const service = new PlatformInsightsService(
    unavailable as PlatformInsightsRepository,
    unavailable as PlatformRepository,
  );
  await assert.rejects(service.dashboard(context), forbidden);
  await assert.rejects(
    service.dashboard({
      ...context,
      isPlatformActor: true,
      tenantId: null,
      roleSystemKey: "SUPER_ADMIN",
    }),
    forbidden,
  );
});
void test("payment/audit CSV projections never serialize extra fields and reject page truncation", () => {
  const payment = {
    id: randomUUID(),
    amountMinor: "9007199254740993",
    currency: "INR",
    paidAt: "2026-10-17T00:00:00Z",
    reference: "=sensitive-ref",
    note: "NEVER_EXPORT_NOTE",
  };
  const text = serializeReport(paymentsCsv({ items: [payment], nextCursor: null })).toString();
  assert.ok(text.includes(payment.amountMinor));
  assert.ok(!text.includes(payment.note));
  assert.throws(() => paymentsCsv({ items: [], nextCursor: "more" }), tooLarge);
  assert.throws(() => auditCsv({ items: [], nextCursor: "more" }), tooLarge);
});
void test("export preparation blocks on audit failure and serializes before audit", async () => {
  let calls = 0;
  const repository = {
    prepared: () => {
      calls++;
      return Promise.reject(new Error("audit unavailable"));
    },
  } as unknown as ReportExportRepository;
  const service = new ReportExportService(repository);
  await assert.rejects(
    service.prepare(context, context.tenantId, "audit", { headers: ["x"], rows: [["safe"]] }),
    /audit unavailable/u,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    service.prepare(context, context.tenantId, "audit", {
      headers: ["x"],
      rows: Array.from({ length: EXPORT_MAX_ROWS + 1 }, () => ["safe"]),
    }),
    tooLarge,
  );
  assert.equal(calls, 1);
});
void test("platform export denies campaign kinds independently of transport parsing", async () => {
  const unreachable = new Proxy(
    {},
    {
      get() {
        throw new Error("Content must not be reached");
      },
    },
  );
  const service = new PlatformReportExportService(
    unreachable as PlatformInsightsService,
    unreachable as ReportExportService,
  );
  await assert.rejects(
    service.download(
      { ...context, isPlatformActor: true, tenantId: null, roleSystemKey: "SUPER_ADMIN" },
      parseReportExport({ kind: "campaign-recipients", campaignId: randomUUID() }),
    ),
    forbidden,
  );
});
