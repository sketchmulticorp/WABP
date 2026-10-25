import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { APP_DATABASE } from "../database/database.constants.js";
import type { AppDatabase, AppDatabaseTransaction } from "../database/database.types.js";
import { webhookEventsInApp, whatsappAccountsInApp } from "../database/schema/index.js";
import type { WebhookPersistResult } from "./webhook.types.js";

const META_PROVIDER = "META";
const META_WEBHOOK_EVENT_TYPE = "META_WHATSAPP_WEBHOOK";

@Injectable()
export class WebhookRepository {
  constructor(@Inject(APP_DATABASE) private readonly database: AppDatabase) {}

  /** Resolves ownership only from a provider-owned phone identifier, never from request input. */
  async findAccountByPhoneNumberId(phoneNumberId: string) {
    const rows = await this.database
      .select({ id: whatsappAccountsInApp.id, tenantId: whatsappAccountsInApp.tenantId })
      .from(whatsappAccountsInApp)
      .where(
        and(
          eq(whatsappAccountsInApp.provider, META_PROVIDER),
          eq(whatsappAccountsInApp.phoneNumberId, phoneNumberId),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async persistVerifiedMetaEvent(input: {
    readonly executor: AppDatabaseTransaction;
    readonly externalEventKey: string;
    readonly payload: Record<string, unknown>;
    readonly tenantId: string | null;
    readonly whatsappAccountId: string | null;
  }): Promise<WebhookPersistResult> {
    const rows = await input.executor
      .insert(webhookEventsInApp)
      .values({
        eventType: META_WEBHOOK_EVENT_TYPE,
        externalEventKey: input.externalEventKey,
        payload: input.payload,
        provider: META_PROVIDER,
        status: "RECEIVED",
        tenantId: input.tenantId,
        whatsappAccountId: input.whatsappAccountId,
      })
      .onConflictDoNothing({
        target: [webhookEventsInApp.provider, webhookEventsInApp.externalEventKey],
      })
      .returning({ id: webhookEventsInApp.id, receivedAt: webhookEventsInApp.receivedAt });

    const event = rows[0];
    return { event: event ?? null, isDuplicate: event === undefined };
  }
}
