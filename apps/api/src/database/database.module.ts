import { type DynamicModule, Global, Module, type Provider } from "@nestjs/common";

import { createDatabaseClient, createDatabasePool } from "./database.client.js";
import type { DatabaseConfig } from "@whatsapp-platform/config/runtime";
import { APP_DATABASE, DATABASE_POOL } from "./database.constants.js";
import { DatabasePoolLifecycle } from "./database-pool.lifecycle.js";
import { DatabaseTransactionManager } from "./database-transaction.manager.js";
import { OutboxRepository } from "./outbox/outbox.repository.js";

@Global()
@Module({})
export class DatabaseModule {
  static register(config: DatabaseConfig): DynamicModule {
    const poolProvider: Provider = {
      provide: DATABASE_POOL,
      useFactory: () => createDatabasePool(config),
    };
    const databaseProvider: Provider = {
      provide: APP_DATABASE,
      useFactory: createDatabaseClient,
      inject: [DATABASE_POOL],
    };

    return {
      global: true,
      module: DatabaseModule,
      providers: [
        poolProvider,
        databaseProvider,
        DatabasePoolLifecycle,
        DatabaseTransactionManager,
        OutboxRepository,
      ],
      exports: [APP_DATABASE, DATABASE_POOL, DatabaseTransactionManager, OutboxRepository],
    };
  }
}
