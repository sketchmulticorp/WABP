import {
  databaseEnvironmentSchema,
  environmentSchema,
  environmentShape,
  previewEnvironmentSchema,
  type ParsedEnvironment,
  type ParsedSeedEnvironment,
  seedEnvironmentSchema,
} from "./environment-schema.js";
import { ConfigurationValidationError } from "./validation-error.js";

export const ENVIRONMENT_KEYS = Object.freeze(Object.keys(environmentShape).sort());

export interface DatabaseConfig {
  readonly url: string;
  readonly poolMin: number;
  readonly poolMax: number;
}

export interface SeedConfig {
  readonly database: DatabaseConfig;
  readonly superAdmin: SeedUserConfig;
  readonly tenant: {
    readonly name: string;
    readonly slug: string;
    readonly timezone: string;
    readonly countryCode: string;
  };
  readonly tenantAdmin: SeedUserConfig;
  readonly tenantUser: SeedUserConfig;
  readonly plan: {
    readonly maxUsers: number;
    readonly maxWhatsappNumbers: number;
    readonly maxContacts: number;
    readonly monthlyMessageLimit: number;
    readonly monthlyCampaignLimit: number;
    readonly maxTemplates: number;
    readonly storageGb: number;
    readonly automationEnabled: boolean;
  };
}

export interface SeedUserConfig {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

export interface RuntimeConfig {
  readonly credentialEncryption?: {
    readonly keys: Readonly<Record<string, string>> | undefined;
    readonly activeKeyId: string | undefined;
  };
  readonly whatsappOnboarding?: {
    readonly mode: "development" | "embedded_signup";
    readonly configurationId: string | undefined;
  };
  readonly deploymentMode?: "full";
  readonly runtime: {
    readonly environment: ParsedEnvironment["NODE_ENV"];
    readonly logLevel: ParsedEnvironment["LOG_LEVEL"];
  };
  readonly http: {
    readonly port: number;
    readonly webPublicUrl: string;
    readonly apiPublicUrl: string;
    readonly corsAllowedOrigins: readonly string[];
    readonly trustProxyHops: number;
  };
  readonly database: DatabaseConfig;
  readonly redis: {
    readonly url: string;
    readonly queuePrefix: string;
  };
  readonly webhooks: {
    readonly maxAttempts: number;
    readonly outboxLockTimeoutSeconds: number;
    readonly queueConcurrency: number;
    readonly relayPollIntervalMs: number;
    readonly retryBaseDelayMs: number;
  };
  readonly imports: {
    readonly relayPollIntervalMs: number;
    readonly queueConcurrency: number;
    readonly maxAttempts: number;
    readonly retryBaseDelayMs: number;
    readonly outboxLockTimeoutSeconds: number;
    readonly processingTimeoutSeconds: number;
  };
  readonly messaging: {
    readonly maxAttempts: number;
    readonly retryBaseDelayMs: number;
    readonly relayPollIntervalMs: number;
    readonly queueConcurrency: number;
    readonly outboxLockTimeoutSeconds: number;
  };
  readonly authentication: {
    readonly bootstrapSecret?: string | undefined;
    readonly jwtAccessSecret: string;
    readonly jwtAccessTtlSeconds: number;
    readonly refreshTokenPepper: string;
    readonly refreshTokenTtlSeconds: number;
    readonly loginWindowSeconds: number;
    readonly loginIpLimit: number;
    readonly loginEmailLimit: number;
    readonly dataEncryptionKey: string | undefined;
  };
  readonly meta: {
    readonly graphApiVersion: string | undefined;
    readonly appId: string | undefined;
    readonly appSecret: string | undefined;
    readonly webhookVerifyToken: string | undefined;
    readonly developmentAccessToken: string | undefined;
  };
  readonly storage: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly forcePathStyle: boolean;
  };
  readonly malwareScanner: {
    readonly host: string;
    readonly port: number;
    readonly timeoutMs: number;
  };
  readonly email: {
    readonly host: string;
    readonly port: number;
    readonly secure: boolean;
    readonly from: string;
  };
  readonly uploads: {
    readonly maxImportFileBytes: number;
    readonly maxImportFileRows: number;
    readonly importRetentionDays: number;
    readonly maxMediaFileBytes: number;
  };
  readonly observability: {
    readonly otlpEndpoint: string | undefined;
    readonly sentryDsn: string | undefined;
  };
}

export type CoreRuntimeConfig = Pick<
  RuntimeConfig,
  "runtime" | "http" | "database" | "redis" | "authentication"
>;
export interface PreviewRuntimeConfig extends CoreRuntimeConfig {
  readonly credentialEncryption?: RuntimeConfig["credentialEncryption"];
  readonly whatsappOnboarding?: RuntimeConfig["whatsappOnboarding"];
  readonly deploymentMode: "preview";
  readonly meta?: RuntimeConfig["meta"];
}
export type ApiRuntimeConfig = RuntimeConfig | PreviewRuntimeConfig;

/** API-only profile selection. Worker/maintenance runtime loaders remain full-only. */
export function loadApiRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiRuntimeConfig {
  if (environment.APP_MODE !== "preview") return loadRuntimeConfig(environment);
  const result = previewEnvironmentSchema.safeParse(environment);
  if (!result.success) throw toConfigurationValidationError(result.error.issues);
  return Object.freeze({
    ...mapCoreRuntimeConfig(result.data),
    deploymentMode: "preview",
    credentialEncryption: Object.freeze({
      keys: result.data.WHATSAPP_CREDENTIAL_KEYRING,
      activeKeyId: result.data.WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID,
    }),
    whatsappOnboarding: Object.freeze({
      mode: result.data.WHATSAPP_ONBOARDING_MODE,
      configurationId: result.data.META_EMBEDDED_SIGNUP_CONFIG_ID,
    }),
    meta: Object.freeze({
      graphApiVersion: result.data.META_GRAPH_API_VERSION,
      appId: result.data.META_APP_ID,
      appSecret: result.data.META_APP_SECRET,
      webhookVerifyToken: result.data.META_WEBHOOK_VERIFY_TOKEN,
      developmentAccessToken: result.data.META_DEVELOPMENT_ACCESS_TOKEN,
    }),
  });
}

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    throw new ConfigurationValidationError(
      result.error.issues.map((issue) => ({
        key: issue.path.join(".") || "environment",
        message: issue.message,
      })),
    );
  }

  return mapRuntimeConfig(result.data);
}

/** Loads only database settings for migration and database maintenance commands. */
export function loadDatabaseConfig(environment: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const result = databaseEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw new ConfigurationValidationError(
      result.error.issues.map((issue) => ({
        key: issue.path.join(".") || "environment",
        message: issue.message,
      })),
    );
  }

  return Object.freeze({
    url: result.data.DATABASE_URL,
    poolMin: result.data.DATABASE_POOL_MIN,
    poolMax: result.data.DATABASE_POOL_MAX,
  });
}

const requiredSeedKeys = [
  "SEED_SUPER_ADMIN_EMAIL",
  "SEED_SUPER_ADMIN_DISPLAY_NAME",
  "SEED_SUPER_ADMIN_PASSWORD",
  "SEED_TENANT_NAME",
  "SEED_TENANT_SLUG",
  "SEED_TENANT_TIMEZONE",
  "SEED_TENANT_COUNTRY_CODE",
  "SEED_TENANT_ADMIN_EMAIL",
  "SEED_TENANT_ADMIN_DISPLAY_NAME",
  "SEED_TENANT_ADMIN_PASSWORD",
  "SEED_TENANT_USER_EMAIL",
  "SEED_TENANT_USER_DISPLAY_NAME",
  "SEED_TENANT_USER_PASSWORD",
] as const satisfies readonly (keyof ParsedSeedEnvironment)[];

/** Loads bootstrap-only values. Normal application startup does not require these secrets. */
export function loadSeedConfig(environment: NodeJS.ProcessEnv = process.env): SeedConfig {
  const result = seedEnvironmentSchema.safeParse(environment);

  if (!result.success) {
    throw toConfigurationValidationError(result.error.issues);
  }

  const missingSeedKeys = requiredSeedKeys.filter((key) => result.data[key] === undefined);
  if (missingSeedKeys.length > 0) {
    throw new ConfigurationValidationError(
      missingSeedKeys.map((key) => ({ key, message: "is required by the seed command" })),
    );
  }

  const superAdminEmail = requireSeedValue(result.data, "SEED_SUPER_ADMIN_EMAIL");
  const superAdminDisplayName = requireSeedValue(result.data, "SEED_SUPER_ADMIN_DISPLAY_NAME");
  const superAdminPassword = requireSeedValue(result.data, "SEED_SUPER_ADMIN_PASSWORD");
  const tenantName = requireSeedValue(result.data, "SEED_TENANT_NAME");
  const tenantSlug = requireSeedValue(result.data, "SEED_TENANT_SLUG");
  const tenantTimezone = requireSeedValue(result.data, "SEED_TENANT_TIMEZONE");
  const tenantCountryCode = requireSeedValue(result.data, "SEED_TENANT_COUNTRY_CODE");
  const tenantAdminEmail = requireSeedValue(result.data, "SEED_TENANT_ADMIN_EMAIL");
  const tenantAdminDisplayName = requireSeedValue(result.data, "SEED_TENANT_ADMIN_DISPLAY_NAME");
  const tenantAdminPassword = requireSeedValue(result.data, "SEED_TENANT_ADMIN_PASSWORD");
  const tenantUserEmail = requireSeedValue(result.data, "SEED_TENANT_USER_EMAIL");
  const tenantUserDisplayName = requireSeedValue(result.data, "SEED_TENANT_USER_DISPLAY_NAME");
  const tenantUserPassword = requireSeedValue(result.data, "SEED_TENANT_USER_PASSWORD");

  validateDistinctSeedEmails([superAdminEmail, tenantAdminEmail, tenantUserEmail]);
  validateTimeZone(tenantTimezone);

  return Object.freeze({
    database: Object.freeze({
      url: result.data.DATABASE_URL,
      poolMin: result.data.DATABASE_POOL_MIN,
      poolMax: result.data.DATABASE_POOL_MAX,
    }),
    superAdmin: mapSeedUser(superAdminEmail, superAdminDisplayName, superAdminPassword),
    tenant: Object.freeze({
      name: tenantName,
      slug: tenantSlug,
      timezone: tenantTimezone,
      countryCode: tenantCountryCode,
    }),
    tenantAdmin: mapSeedUser(tenantAdminEmail, tenantAdminDisplayName, tenantAdminPassword),
    tenantUser: mapSeedUser(tenantUserEmail, tenantUserDisplayName, tenantUserPassword),
    plan: Object.freeze({
      maxUsers: result.data.SEED_PLAN_MAX_USERS,
      maxWhatsappNumbers: result.data.SEED_PLAN_MAX_WHATSAPP_NUMBERS,
      maxContacts: result.data.SEED_PLAN_MAX_CONTACTS,
      monthlyMessageLimit: result.data.SEED_PLAN_MONTHLY_MESSAGE_LIMIT,
      monthlyCampaignLimit: result.data.SEED_PLAN_MONTHLY_CAMPAIGN_LIMIT,
      maxTemplates: result.data.SEED_PLAN_MAX_TEMPLATES,
      storageGb: result.data.SEED_PLAN_STORAGE_GB,
      automationEnabled: result.data.SEED_PLAN_AUTOMATION_ENABLED,
    }),
  });
}

function mapRuntimeConfig(environment: ParsedEnvironment): RuntimeConfig {
  return Object.freeze({
    ...mapCoreRuntimeConfig(environment),
    credentialEncryption: Object.freeze({
      keys: environment.WHATSAPP_CREDENTIAL_KEYRING,
      activeKeyId: environment.WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID,
    }),
    whatsappOnboarding: Object.freeze({
      mode: environment.WHATSAPP_ONBOARDING_MODE,
      configurationId: environment.META_EMBEDDED_SIGNUP_CONFIG_ID,
    }),
    deploymentMode: "full",
    webhooks: Object.freeze({
      maxAttempts: environment.WEBHOOK_MAX_ATTEMPTS,
      outboxLockTimeoutSeconds: environment.WEBHOOK_OUTBOX_LOCK_TIMEOUT_SECONDS,
      queueConcurrency: environment.WEBHOOK_QUEUE_CONCURRENCY,
      relayPollIntervalMs: environment.WEBHOOK_RELAY_POLL_INTERVAL_MS,
      retryBaseDelayMs: environment.WEBHOOK_RETRY_BASE_DELAY_MS,
    }),
    imports: Object.freeze({
      relayPollIntervalMs: environment.IMPORT_RELAY_POLL_INTERVAL_MS,
      queueConcurrency: environment.IMPORT_QUEUE_CONCURRENCY,
      maxAttempts: environment.IMPORT_MAX_ATTEMPTS,
      retryBaseDelayMs: environment.IMPORT_RETRY_BASE_DELAY_MS,
      outboxLockTimeoutSeconds: environment.IMPORT_OUTBOX_LOCK_TIMEOUT_SECONDS,
      processingTimeoutSeconds: environment.IMPORT_PROCESSING_TIMEOUT_SECONDS,
    }),
    messaging: Object.freeze({
      maxAttempts: environment.MESSAGE_MAX_ATTEMPTS,
      retryBaseDelayMs: environment.MESSAGE_RETRY_BASE_DELAY_MS,
      relayPollIntervalMs: environment.MESSAGE_RELAY_POLL_INTERVAL_MS,
      queueConcurrency: environment.MESSAGE_QUEUE_CONCURRENCY,
      outboxLockTimeoutSeconds: environment.MESSAGE_OUTBOX_LOCK_TIMEOUT_SECONDS,
    }),
    meta: Object.freeze({
      graphApiVersion: environment.META_GRAPH_API_VERSION,
      appId: environment.META_APP_ID,
      appSecret: environment.META_APP_SECRET,
      webhookVerifyToken: environment.META_WEBHOOK_VERIFY_TOKEN,
      developmentAccessToken: environment.META_DEVELOPMENT_ACCESS_TOKEN,
    }),
    storage: Object.freeze({
      endpoint: environment.S3_ENDPOINT,
      region: environment.S3_REGION,
      bucket: environment.S3_BUCKET,
      accessKeyId: environment.S3_ACCESS_KEY_ID,
      secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
      forcePathStyle: environment.S3_FORCE_PATH_STYLE,
    }),
    malwareScanner: Object.freeze({
      host: environment.CLAMAV_HOST,
      port: environment.CLAMAV_PORT,
      timeoutMs: environment.CLAMAV_TIMEOUT_MS,
    }),
    email: Object.freeze({
      host: environment.SMTP_HOST,
      port: environment.SMTP_PORT,
      secure: environment.SMTP_SECURE,
      from: environment.SMTP_FROM,
    }),
    uploads: Object.freeze({
      maxImportFileBytes: environment.MAX_IMPORT_FILE_BYTES,
      maxImportFileRows: environment.MAX_IMPORT_FILE_ROWS,
      importRetentionDays: environment.IMPORT_RETENTION_DAYS,
      maxMediaFileBytes: environment.MAX_MEDIA_FILE_BYTES,
    }),
    observability: Object.freeze({
      otlpEndpoint: environment.OTEL_EXPORTER_OTLP_ENDPOINT,
      sentryDsn: environment.SENTRY_DSN,
    }),
  });
}

type CoreEnvironment = Pick<
  ParsedEnvironment,
  | "NODE_ENV"
  | "LOG_LEVEL"
  | "PORT"
  | "WEB_PUBLIC_URL"
  | "API_PUBLIC_URL"
  | "CORS_ALLOWED_ORIGINS"
  | "HTTP_TRUST_PROXY_HOPS"
  | "DATABASE_URL"
  | "DATABASE_POOL_MIN"
  | "DATABASE_POOL_MAX"
  | "REDIS_URL"
  | "QUEUE_PREFIX"
  | "JWT_ACCESS_SECRET"
  | "BOOTSTRAP_SECRET"
  | "JWT_ACCESS_TTL_SECONDS"
  | "REFRESH_TOKEN_PEPPER"
  | "REFRESH_TOKEN_TTL_SECONDS"
  | "AUTH_LOGIN_WINDOW_SECONDS"
  | "AUTH_LOGIN_IP_LIMIT"
  | "AUTH_LOGIN_EMAIL_LIMIT"
  | "DATA_ENCRYPTION_KEY"
>;

/** Shared mapping keeps auth, tenancy infrastructure and cookie inputs identical in both modes. */
function mapCoreRuntimeConfig(environment: CoreEnvironment): CoreRuntimeConfig {
  return Object.freeze({
    runtime: Object.freeze({ environment: environment.NODE_ENV, logLevel: environment.LOG_LEVEL }),
    http: Object.freeze({
      port: environment.PORT,
      webPublicUrl: environment.WEB_PUBLIC_URL,
      apiPublicUrl: environment.API_PUBLIC_URL,
      corsAllowedOrigins: Object.freeze([...environment.CORS_ALLOWED_ORIGINS]),
      trustProxyHops: environment.HTTP_TRUST_PROXY_HOPS,
    }),
    database: Object.freeze({
      url: environment.DATABASE_URL,
      poolMin: environment.DATABASE_POOL_MIN,
      poolMax: environment.DATABASE_POOL_MAX,
    }),
    redis: Object.freeze({ url: environment.REDIS_URL, queuePrefix: environment.QUEUE_PREFIX }),
    authentication: Object.freeze({
      bootstrapSecret: environment.BOOTSTRAP_SECRET,
      jwtAccessSecret: requireAuthenticationSecret(environment.JWT_ACCESS_SECRET),
      jwtAccessTtlSeconds: environment.JWT_ACCESS_TTL_SECONDS,
      refreshTokenPepper: requireAuthenticationSecret(environment.REFRESH_TOKEN_PEPPER),
      refreshTokenTtlSeconds: environment.REFRESH_TOKEN_TTL_SECONDS,
      loginWindowSeconds: environment.AUTH_LOGIN_WINDOW_SECONDS,
      loginIpLimit: environment.AUTH_LOGIN_IP_LIMIT,
      loginEmailLimit: environment.AUTH_LOGIN_EMAIL_LIMIT,
      dataEncryptionKey: environment.DATA_ENCRYPTION_KEY,
    }),
  });
}

function mapSeedUser(email: string, displayName: string, password: string): SeedUserConfig {
  return Object.freeze({
    email: email.toLowerCase(),
    displayName,
    password,
  });
}

function requireAuthenticationSecret(value: string | undefined): string {
  if (value === undefined) {
    throw new ConfigurationValidationError([
      { key: "authentication", message: "required authentication secret is missing" },
    ]);
  }
  return value;
}

function validateDistinctSeedEmails(seedEmails: readonly string[]): void {
  const emails = seedEmails.map((email) => email.toLowerCase());

  if (new Set(emails).size !== emails.length) {
    throw new ConfigurationValidationError([
      { key: "SEED_*_EMAIL", message: "bootstrap account emails must be distinct" },
    ]);
  }
}

function requireSeedValue(
  environment: ParsedSeedEnvironment,
  key: (typeof requiredSeedKeys)[number],
): string {
  const value = environment[key];
  if (value === undefined) {
    throw new ConfigurationValidationError([{ key, message: "is required by the seed command" }]);
  }
  return value;
}

function validateTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    throw new ConfigurationValidationError([
      { key: "SEED_TENANT_TIMEZONE", message: "must be a valid IANA time zone" },
    ]);
  }
}

function toConfigurationValidationError(
  issues: readonly { readonly message: string; readonly path: PropertyKey[] }[],
): ConfigurationValidationError {
  return new ConfigurationValidationError(
    issues.map((issue) => ({
      key: issue.path.join(".") || "environment",
      message: issue.message,
    })),
  );
}
