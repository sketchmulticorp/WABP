import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema/index.ts",
  out: "./database/migrations",
  schemaFilter: ["app"],
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations",
  },
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});
