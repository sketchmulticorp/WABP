import { z } from "zod";

const emptyStringToUndefined = (value: unknown): unknown => (value === "" ? undefined : value);

const optionalString = (minimumLength = 1) =>
  z.preprocess(emptyStringToUndefined, z.string().min(minimumLength).optional());

const optionalUrl = z.preprocess(emptyStringToUndefined, z.url().optional());

const credentialKeyring = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .max(16384)
    .transform((raw, context) => {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
          throw new Error();
        const entries = Object.entries(parsed);
        const keys: [string, string][] = [];
        if (entries.length < 1 || entries.length > 10) throw new Error();
        for (const [id, value] of entries) {
          if (
            !/^[A-Za-z0-9_-]{1,32}$/u.test(id) ||
            typeof value !== "string" ||
            !/^[A-Za-z0-9+/]{43}=$/u.test(value) ||
            Buffer.from(value, "base64").length !== 32 ||
            Buffer.from(value, "base64").toString("base64") !== value
          )
            throw new Error();
          keys.push([id, value]);
        }
        return Object.freeze(Object.fromEntries(keys));
      } catch {
        context.addIssue({
          code: "custom",
          message: "must contain 1–10 named canonical base64 32-byte keys",
        });
        return z.NEVER;
      }
    })
    .optional(),
);

const integer = (minimum: number, maximum: number) =>
  z.coerce.number().int().min(minimum).max(maximum);

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

const strongBootstrapPassword = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/u, "must contain a lowercase letter")
  .regex(/[A-Z]/u, "must contain an uppercase letter")
  .regex(/\d/u, "must contain a number")
  .regex(/[^A-Za-z0-9]/u, "must contain a symbol");

const optionalBootstrapPassword = z.preprocess(
  emptyStringToUndefined,
  strongBootstrapPassword.optional(),
);

const commaSeparatedUrls = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )
  .pipe(z.array(z.url()).min(1));

const databaseUrl = z
  .url()
  .refine(
    (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "must use the postgres or postgresql protocol",
  );

const databaseEnvironmentShape = {
  DATABASE_URL: databaseUrl,
  DATABASE_POOL_MIN: integer(0, 100).default(2),
  DATABASE_POOL_MAX: integer(1, 200).default(10),
} satisfies z.ZodRawShape;

function validateDatabasePoolBounds(
  environment: { DATABASE_POOL_MAX: number; DATABASE_POOL_MIN: number },
  context: z.RefinementCtx,
): void {
  if (environment.DATABASE_POOL_MIN > environment.DATABASE_POOL_MAX) {
    context.addIssue({
      code: "custom",
      message: "must not exceed DATABASE_POOL_MAX",
      path: ["DATABASE_POOL_MIN"],
    });
  }
}

export const databaseEnvironmentSchema = z
  .object(databaseEnvironmentShape)
  .superRefine(validateDatabasePoolBounds);

const seedEnvironmentShape = {
  SEED_SUPER_ADMIN_EMAIL: z.preprocess(emptyStringToUndefined, z.email().optional()),
  SEED_SUPER_ADMIN_DISPLAY_NAME: optionalString(2),
  SEED_SUPER_ADMIN_PASSWORD: optionalBootstrapPassword,
  SEED_TENANT_NAME: optionalString(2),
  SEED_TENANT_SLUG: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .optional(),
  ),
  SEED_TENANT_TIMEZONE: optionalString(1),
  SEED_TENANT_COUNTRY_CODE: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .regex(/^[A-Z]{2}$/u)
      .optional(),
  ),
  SEED_TENANT_ADMIN_EMAIL: z.preprocess(emptyStringToUndefined, z.email().optional()),
  SEED_TENANT_ADMIN_DISPLAY_NAME: optionalString(2),
  SEED_TENANT_ADMIN_PASSWORD: optionalBootstrapPassword,
  SEED_TENANT_USER_EMAIL: z.preprocess(emptyStringToUndefined, z.email().optional()),
  SEED_TENANT_USER_DISPLAY_NAME: optionalString(2),
  SEED_TENANT_USER_PASSWORD: optionalBootstrapPassword,
  SEED_PLAN_MAX_USERS: integer(1, 10_000).default(100),
  SEED_PLAN_MAX_WHATSAPP_NUMBERS: integer(1, 1_000).default(10),
  SEED_PLAN_MAX_CONTACTS: integer(1, 100_000_000).default(100_000),
  SEED_PLAN_MONTHLY_MESSAGE_LIMIT: integer(1, 1_000_000_000).default(1_000_000),
  SEED_PLAN_MONTHLY_CAMPAIGN_LIMIT: integer(1, 10_000_000).default(10_000),
  SEED_PLAN_MAX_TEMPLATES: integer(1, 1_000_000).default(1_000),
  SEED_PLAN_STORAGE_GB: integer(1, 100_000).default(100),
  SEED_PLAN_AUTOMATION_ENABLED: booleanString.default(true),
} satisfies z.ZodRawShape;

export const seedEnvironmentSchema = z
  .object({
    ...databaseEnvironmentShape,
    ...seedEnvironmentShape,
  })
  .superRefine(validateDatabasePoolBounds);

export const environmentShape = {
  // Full runtimes (including workers) must never silently accept the restricted API profile.
  APP_MODE: z.literal("full").default("full"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  PORT: integer(1, 65_535).default(4_000),
  WEB_PUBLIC_URL: z.url().default("http://localhost:3000"),
  API_PUBLIC_URL: z.url().default("http://localhost:4000"),
  NEXT_PUBLIC_API_URL: z.url().default("http://localhost:4000/api/v1"),
  CORS_ALLOWED_ORIGINS: commaSeparatedUrls.default(["http://localhost:3000"]),
  HTTP_TRUST_PROXY_HOPS: integer(0, 10).default(0),

  POSTGRES_DB: z.string().min(1).default("whatsapp_saas"),
  POSTGRES_USER: z.string().min(1).default("whatsapp"),
  POSTGRES_PASSWORD: z.string().min(8).default("whatsapp_local_only"),
  POSTGRES_PORT: integer(1, 65_535).default(5_432),
  ...databaseEnvironmentShape,

  REDIS_PORT: integer(1, 65_535).default(6_379),
  REDIS_URL: z.url(),
  QUEUE_PREFIX: z.string().min(1).default("whatsapp-saas"),
  WEBHOOK_RELAY_POLL_INTERVAL_MS: integer(100, 60_000).default(1_000),
  WEBHOOK_QUEUE_CONCURRENCY: integer(1, 100).default(5),
  WEBHOOK_MAX_ATTEMPTS: integer(1, 20).default(5),
  WEBHOOK_RETRY_BASE_DELAY_MS: integer(100, 300_000).default(1_000),
  WEBHOOK_OUTBOX_LOCK_TIMEOUT_SECONDS: integer(5, 3_600).default(60),
  IMPORT_RELAY_POLL_INTERVAL_MS: integer(100, 60_000).default(1_000),
  IMPORT_QUEUE_CONCURRENCY: integer(1, 10).default(1),
  IMPORT_MAX_ATTEMPTS: integer(1, 10).default(3),
  IMPORT_RETRY_BASE_DELAY_MS: integer(100, 300_000).default(5_000),
  IMPORT_OUTBOX_LOCK_TIMEOUT_SECONDS: integer(5, 3_600).default(300),
  IMPORT_PROCESSING_TIMEOUT_SECONDS: integer(60, 86_400).default(900),
  MESSAGE_RELAY_POLL_INTERVAL_MS: integer(100, 60_000).default(1_000),
  MESSAGE_QUEUE_CONCURRENCY: integer(1, 100).default(10),
  MESSAGE_OUTBOX_LOCK_TIMEOUT_SECONDS: integer(5, 3_600).default(60),
  MESSAGE_MAX_ATTEMPTS: integer(1, 20).default(5),
  MESSAGE_RETRY_BASE_DELAY_MS: integer(100, 300_000).default(1_000),

  JWT_ACCESS_SECRET: optionalString(32),
  BOOTSTRAP_SECRET: optionalString(32),
  JWT_ACCESS_TTL_SECONDS: integer(60, 86_400).default(900),
  REFRESH_TOKEN_PEPPER: optionalString(32),
  REFRESH_TOKEN_TTL_SECONDS: integer(3_600, 31_536_000).default(2_592_000),
  AUTH_LOGIN_WINDOW_SECONDS: integer(60, 86_400).default(900),
  AUTH_LOGIN_IP_LIMIT: integer(1, 100_000).default(100),
  AUTH_LOGIN_EMAIL_LIMIT: integer(1, 10_000).default(10),
  DATA_ENCRYPTION_KEY: optionalString(32),
  WHATSAPP_CREDENTIAL_KEYRING: credentialKeyring,
  WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,32}$/u)
      .optional(),
  ),

  META_GRAPH_API_VERSION: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .regex(/^v\d+\.\d+$/)
      .optional(),
  ),
  META_APP_ID: optionalString(),
  WHATSAPP_ONBOARDING_MODE: z.enum(["development", "embedded_signup"]).default("development"),
  META_EMBEDDED_SIGNUP_CONFIG_ID: z.preprocess(
    emptyStringToUndefined,
    z.string().regex(/^\d+$/).optional(),
  ),
  META_APP_SECRET: optionalString(16),
  META_WEBHOOK_VERIFY_TOKEN: optionalString(16),
  META_DEVELOPMENT_ACCESS_TOKEN: optionalString(),

  MINIO_API_PORT: integer(1, 65_535).default(9_000),
  MINIO_CONSOLE_PORT: integer(1, 65_535).default(9_001),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(3),
  S3_SECRET_ACCESS_KEY: z.string().min(8),
  S3_FORCE_PATH_STYLE: booleanString.default(false),

  CLAMAV_HOST: z.string().min(1).default("127.0.0.1"),
  CLAMAV_PORT: integer(1, 65_535).default(3_310),
  CLAMAV_TIMEOUT_MS: integer(1_000, 300_000).default(120_000),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: integer(1, 65_535),
  SMTP_SECURE: booleanString.default(false),
  SMTP_FROM: z.email(),
  MAILPIT_SMTP_PORT: integer(1, 65_535).default(1_025),
  MAILPIT_UI_PORT: integer(1, 65_535).default(8_025),
  MAILPIT_MAX_MESSAGES: integer(1, 100_000).default(500),

  MAX_IMPORT_FILE_BYTES: integer(1, 10_485_760).default(10_485_760),
  MAX_IMPORT_FILE_ROWS: integer(1, 10_000).default(10_000),
  IMPORT_RETENTION_DAYS: integer(1, 3_650).default(30),
  MAX_MEDIA_FILE_BYTES: integer(1, 1_073_741_824).default(16_777_216),

  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  SENTRY_DSN: optionalUrl,

  ...seedEnvironmentShape,
} satisfies z.ZodRawShape;

const productionSecrets = [
  "DATA_ENCRYPTION_KEY",
  "META_GRAPH_API_VERSION",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
] as const satisfies readonly (keyof typeof environmentShape)[];

const authenticationSecrets = ["JWT_ACCESS_SECRET", "REFRESH_TOKEN_PEPPER"] as const;

export const environmentSchema = z.object(environmentShape).superRefine((environment, context) => {
  validateDatabasePoolBounds(environment, context);
  validateCredentialKeys(environment, context);

  for (const key of authenticationSecrets) {
    if (environment[key] === undefined) {
      context.addIssue({
        code: "custom",
        message: "is required when authentication is enabled",
        path: [key],
      });
    }
  }

  if (environment.NODE_ENV !== "production") {
    return;
  }

  for (const key of productionSecrets) {
    if (environment[key] === undefined) {
      context.addIssue({
        code: "custom",
        message: "is required in production",
        path: [key],
      });
    }
  }
});

export type ParsedEnvironment = z.infer<typeof environmentSchema>;
export type ParsedSeedEnvironment = z.infer<typeof seedEnvironmentSchema>;

/** Only dependencies used by the limited API; unused full-service inputs are not parsed. */
export const previewEnvironmentSchema = z
  .object({
    APP_MODE: z.literal("preview"),
    WHATSAPP_CREDENTIAL_KEYRING: environmentShape.WHATSAPP_CREDENTIAL_KEYRING,
    WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID: environmentShape.WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID,
    WHATSAPP_ONBOARDING_MODE: environmentShape.WHATSAPP_ONBOARDING_MODE,
    META_EMBEDDED_SIGNUP_CONFIG_ID: environmentShape.META_EMBEDDED_SIGNUP_CONFIG_ID,
    META_GRAPH_API_VERSION: environmentShape.META_GRAPH_API_VERSION,
    META_APP_ID: environmentShape.META_APP_ID,
    META_APP_SECRET: environmentShape.META_APP_SECRET,
    META_WEBHOOK_VERIFY_TOKEN: environmentShape.META_WEBHOOK_VERIFY_TOKEN,
    META_DEVELOPMENT_ACCESS_TOKEN: environmentShape.META_DEVELOPMENT_ACCESS_TOKEN,
    NODE_ENV: environmentShape.NODE_ENV,
    LOG_LEVEL: environmentShape.LOG_LEVEL,
    PORT: environmentShape.PORT,
    WEB_PUBLIC_URL: environmentShape.WEB_PUBLIC_URL,
    API_PUBLIC_URL: environmentShape.API_PUBLIC_URL,
    CORS_ALLOWED_ORIGINS: environmentShape.CORS_ALLOWED_ORIGINS,
    HTTP_TRUST_PROXY_HOPS: environmentShape.HTTP_TRUST_PROXY_HOPS,
    ...databaseEnvironmentShape,
    REDIS_URL: environmentShape.REDIS_URL,
    QUEUE_PREFIX: environmentShape.QUEUE_PREFIX,
    JWT_ACCESS_SECRET: z.string().min(32),
    BOOTSTRAP_SECRET: environmentShape.BOOTSTRAP_SECRET,
    JWT_ACCESS_TTL_SECONDS: environmentShape.JWT_ACCESS_TTL_SECONDS,
    REFRESH_TOKEN_PEPPER: z.string().min(32),
    REFRESH_TOKEN_TTL_SECONDS: environmentShape.REFRESH_TOKEN_TTL_SECONDS,
    AUTH_LOGIN_WINDOW_SECONDS: environmentShape.AUTH_LOGIN_WINDOW_SECONDS,
    AUTH_LOGIN_IP_LIMIT: environmentShape.AUTH_LOGIN_IP_LIMIT,
    AUTH_LOGIN_EMAIL_LIMIT: environmentShape.AUTH_LOGIN_EMAIL_LIMIT,
    DATA_ENCRYPTION_KEY: environmentShape.DATA_ENCRYPTION_KEY,
  })
  .superRefine(validateDatabasePoolBounds)
  .superRefine(validateCredentialKeys);

function validateCredentialKeys(
  environment: {
    WHATSAPP_CREDENTIAL_KEYRING?: Readonly<Record<string, string>> | undefined;
    WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID?: string | undefined;
  },
  context: z.RefinementCtx,
) {
  const keys = environment.WHATSAPP_CREDENTIAL_KEYRING;
  const active = environment.WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID;
  if (
    (keys !== undefined || active !== undefined) &&
    (keys === undefined || active === undefined || !Object.hasOwn(keys, active))
  )
    context.addIssue({
      code: "custom",
      path: ["WHATSAPP_CREDENTIAL_ACTIVE_KEY_ID"],
      message: "must identify a key in WHATSAPP_CREDENTIAL_KEYRING",
    });
}
