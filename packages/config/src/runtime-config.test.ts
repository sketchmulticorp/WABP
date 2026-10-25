import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ENVIRONMENT_KEYS,
  loadDatabaseConfig,
  loadApiRuntimeConfig,
  loadRuntimeConfig,
  loadSeedConfig,
} from "./runtime-config.js";
import { ConfigurationValidationError } from "./validation-error.js";

const requiredDevelopmentEnvironment = {
  DATABASE_URL: "postgresql://whatsapp:local@localhost:5432/whatsapp_saas",
  JWT_ACCESS_SECRET: "test-access-secret-that-is-at-least-thirty-two-characters",
  REDIS_URL: "redis://localhost:6379",
  REFRESH_TOKEN_PEPPER: "test-refresh-pepper-that-is-at-least-thirty-two-characters",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "whatsapp-saas-local",
  S3_ACCESS_KEY_ID: "local-access-key",
  S3_SECRET_ACCESS_KEY: "local-secret-key",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  SMTP_FROM: "no-reply@whatsapp-saas.local",
} satisfies NodeJS.ProcessEnv;

const requiredSeedEnvironment = {
  ...requiredDevelopmentEnvironment,
  SEED_SUPER_ADMIN_EMAIL: "owner@example.test",
  SEED_SUPER_ADMIN_DISPLAY_NAME: "Platform Owner",
  SEED_SUPER_ADMIN_PASSWORD: "Strong!Owner123",
  SEED_TENANT_NAME: "Example Clinic",
  SEED_TENANT_SLUG: "example-clinic",
  SEED_TENANT_TIMEZONE: "Asia/Kolkata",
  SEED_TENANT_COUNTRY_CODE: "IN",
  SEED_TENANT_ADMIN_EMAIL: "doctor@example.test",
  SEED_TENANT_ADMIN_DISPLAY_NAME: "Example Doctor",
  SEED_TENANT_ADMIN_PASSWORD: "Strong!Admin123",
  SEED_TENANT_USER_EMAIL: "assistant@example.test",
  SEED_TENANT_USER_DISPLAY_NAME: "Example Assistant",
  SEED_TENANT_USER_PASSWORD: "Strong!User123",
} satisfies NodeJS.ProcessEnv;

void test("loads a typed, immutable runtime configuration", () => {
  const config = loadRuntimeConfig({
    ...requiredDevelopmentEnvironment,
    CORS_ALLOWED_ORIGINS: "http://localhost:3000,https://preview.example.com",
    DATABASE_POOL_MIN: "3",
    DATABASE_POOL_MAX: "12",
    PORT: "4100",
    S3_FORCE_PATH_STYLE: "true",
    SMTP_SECURE: "false",
  });

  assert.equal(config.http.port, 4_100);
  assert.deepEqual(config.http.corsAllowedOrigins, [
    "http://localhost:3000",
    "https://preview.example.com",
  ]);
  assert.equal(config.database.poolMin, 3);
  assert.equal(config.database.poolMax, 12);
  assert.equal(config.storage.forcePathStyle, true);
  assert.equal(config.email.secure, false);
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.storage), true);
});

void test("requires security and Meta credentials in production", () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        ...requiredDevelopmentEnvironment,
        JWT_ACCESS_SECRET: undefined,
        NODE_ENV: "production",
        REFRESH_TOKEN_PEPPER: undefined,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationValidationError);

      const issueKeys = error.issues.map((issue) => issue.key);
      assert.ok(issueKeys.includes("JWT_ACCESS_SECRET"));
      assert.ok(issueKeys.includes("REFRESH_TOKEN_PEPPER"));
      assert.ok(issueKeys.includes("DATA_ENCRYPTION_KEY"));
      assert.ok(issueKeys.includes("META_APP_SECRET"));
      return true;
    },
  );
});

void test("requires authentication secrets in every runtime environment", () => {
  assert.throws(
    () => loadRuntimeConfig({ ...requiredDevelopmentEnvironment, JWT_ACCESS_SECRET: undefined }),
    (error: unknown) =>
      error instanceof ConfigurationValidationError &&
      error.issues.some((issue) => issue.key === "JWT_ACCESS_SECRET"),
  );
});

void test("reports invalid keys without leaking submitted values", () => {
  const sensitiveInvalidValue = "invalid-url-containing-a-sensitive-token";

  assert.throws(
    () =>
      loadRuntimeConfig({
        ...requiredDevelopmentEnvironment,
        DATABASE_URL: sensitiveInvalidValue,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationValidationError);
      assert.match(error.message, /DATABASE_URL/);
      assert.doesNotMatch(error.message, new RegExp(sensitiveInvalidValue));
      return true;
    },
  );
});

void test("rejects a database minimum pool larger than its maximum", () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        ...requiredDevelopmentEnvironment,
        DATABASE_POOL_MIN: "20",
        DATABASE_POOL_MAX: "10",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationValidationError);
      assert.equal(error.issues[0]?.key, "DATABASE_POOL_MIN");
      return true;
    },
  );
});

void test("storage-free preview validates optional Meta settings without storage or email", () => {
  const environment = {
    APP_MODE: "preview",
    NODE_ENV: "production",
    DATABASE_URL: requiredDevelopmentEnvironment.DATABASE_URL,
    REDIS_URL: requiredDevelopmentEnvironment.REDIS_URL,
    JWT_ACCESS_SECRET: requiredDevelopmentEnvironment.JWT_ACCESS_SECRET,
    REFRESH_TOKEN_PEPPER: requiredDevelopmentEnvironment.REFRESH_TOKEN_PEPPER,
  };
  const config = loadApiRuntimeConfig(environment);
  assert.equal(config.deploymentMode, "preview");
  assert.equal("storage" in config, false);
  assert.equal("email" in config, false);
  assert.equal(config.meta?.developmentAccessToken, undefined);
  assert.equal(
    loadApiRuntimeConfig({ ...environment, META_GRAPH_API_VERSION: "v99.0" }).meta?.graphApiVersion,
    "v99.0",
  );
  assert.throws(
    () => loadApiRuntimeConfig({ ...environment, META_GRAPH_API_VERSION: "bad" }),
    ConfigurationValidationError,
  );
  assert.throws(() => loadRuntimeConfig(environment), ConfigurationValidationError);
  const keys = JSON.stringify({ v1: Buffer.alloc(32, 1).toString("base64") });
  const embedded = loadApiRuntimeConfig({
    ...environment,
    WHATSAPP_ONBOARDING_MODE: "embedded_signup",
    META_EMBEDDED_SIGNUP_CONFIG_ID: "123456",
    WHATSAPP_CREDENTIAL_KEYRING: keys,
    WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID: "v1",
  });
  assert.equal(embedded.whatsappOnboarding?.mode, "embedded_signup");
  assert.equal(embedded.credentialEncryption?.activeKeyId, "v1");
  for (const invalid of [
    { WHATSAPP_ONBOARDING_MODE: "invalid" },
    { META_EMBEDDED_SIGNUP_CONFIG_ID: "https://example.test" },
    { WHATSAPP_CREDENTIAL_KEYRING: "secret-value-not-json" },
    { WHATSAPP_CREDENTIAL_KEYRING: keys, WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID: "missing" },
    {
      WHATSAPP_CREDENTIAL_KEYRING: JSON.stringify({ v1: "bad" }),
      WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID: "v1",
    },
  ])
    assert.throws(
      () => loadApiRuntimeConfig({ ...environment, ...invalid }),
      ConfigurationValidationError,
    );
});

void test("loads database-only configuration for migration commands", () => {
  const config = loadDatabaseConfig({
    DATABASE_POOL_MAX: "4",
    DATABASE_POOL_MIN: "1",
    DATABASE_URL: requiredDevelopmentEnvironment.DATABASE_URL,
  });

  assert.deepEqual(config, {
    poolMax: 4,
    poolMin: 1,
    url: requiredDevelopmentEnvironment.DATABASE_URL,
  });
  assert.equal(Object.isFrozen(config), true);
});

void test("loads seed configuration only when every bootstrap identity is explicit", () => {
  const config = loadSeedConfig(requiredSeedEnvironment);

  assert.equal(config.superAdmin.email, "owner@example.test");
  assert.equal(config.tenant.slug, "example-clinic");
  assert.equal(config.plan.maxUsers, 100);
  assert.equal(config.plan.automationEnabled, true);
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.superAdmin), true);
});

void test("rejects missing, duplicated, or unsafe seed identity values", () => {
  assert.throws(
    () => loadSeedConfig(requiredDevelopmentEnvironment),
    (error: unknown) =>
      error instanceof ConfigurationValidationError &&
      error.issues.some((issue) => issue.key === "SEED_SUPER_ADMIN_EMAIL"),
  );

  assert.throws(
    () =>
      loadSeedConfig({
        ...requiredSeedEnvironment,
        SEED_TENANT_USER_EMAIL: requiredSeedEnvironment.SEED_TENANT_ADMIN_EMAIL,
      }),
    /bootstrap account emails must be distinct/u,
  );

  assert.throws(
    () =>
      loadSeedConfig({
        ...requiredSeedEnvironment,
        SEED_TENANT_TIMEZONE: "Not/A_Timezone",
      }),
    /valid IANA time zone/u,
  );
});

void test("keeps .env.example in exact parity with validated environment keys", () => {
  const templateUrl = new URL("../../../.env.example", import.meta.url);
  const templateKeys = readEnvironmentTemplateKeys(readFileSync(templateUrl, "utf8"));

  assert.equal(
    new Set(templateKeys).size,
    templateKeys.length,
    ".env.example must not contain duplicate keys",
  );
  assert.deepEqual(templateKeys.toSorted(), ENVIRONMENT_KEYS);
});

function readEnvironmentTemplateKeys(contents: string): string[] {
  return contents
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      assert.notEqual(separatorIndex, -1, `Invalid .env.example entry: ${line}`);
      return line.slice(0, separatorIndex);
    });
}
