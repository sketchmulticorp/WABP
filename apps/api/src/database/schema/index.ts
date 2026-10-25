/**
 * Public entry point for the Drizzle persistence model.
 *
 * Keep database access inside repository classes. Services and controllers must
 * not import these table definitions directly.
 */
export * from "./app-schema.entity.js";
