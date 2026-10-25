import { Inject, Injectable } from "@nestjs/common";
import type { PgTransactionConfig } from "drizzle-orm/pg-core";

import { APP_DATABASE } from "./database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "./database.types.js";

export type TransactionWork<TResult> = (transaction: AppDatabaseTransaction) => Promise<TResult>;

/**
 * Infrastructure transaction boundary injected into application services.
 * Services own the workflow; repositories receive the provided transaction explicitly.
 */
@Injectable()
export class DatabaseTransactionManager {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  execute<TResult>(work: TransactionWork<TResult>, config?: PgTransactionConfig): Promise<TResult> {
    return config === undefined
      ? this.database.transaction(work)
      : this.database.transaction(work, config);
  }
}
