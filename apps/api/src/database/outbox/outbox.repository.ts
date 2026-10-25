import { Injectable } from "@nestjs/common";

import type { AppDatabaseTransaction } from "../database.types.js";
import { outboxEventsInApp } from "../schema/index.js";

export interface CreateOutboxEvent {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly availableAt?: string;
  readonly correlationId: string;
  readonly eventType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly schemaVersion?: number;
  readonly tenantId: string | null;
}

export interface PersistedOutboxEvent {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly availableAt: string;
  readonly correlationId: string;
  readonly createdAt: string;
  readonly eventType: string;
  readonly id: string;
  readonly schemaVersion: number;
  readonly status: string;
  readonly tenantId: string | null;
}

@Injectable()
export class OutboxRepository {
  /**
   * Requires the service-owned transaction so business state and its durable queue
   * handoff cannot be committed independently.
   */
  async create(
    executor: AppDatabaseTransaction,
    event: CreateOutboxEvent,
  ): Promise<PersistedOutboxEvent> {
    const rows = await executor
      .insert(outboxEventsInApp)
      .values({
        aggregateId: event.aggregateId,
        aggregateType: event.aggregateType,
        correlationId: event.correlationId,
        eventType: event.eventType,
        payload: event.payload,
        tenantId: event.tenantId,
        ...(event.availableAt === undefined ? {} : { availableAt: event.availableAt }),
        ...(event.schemaVersion === undefined ? {} : { schemaVersion: event.schemaVersion }),
      })
      .returning({
        aggregateId: outboxEventsInApp.aggregateId,
        aggregateType: outboxEventsInApp.aggregateType,
        availableAt: outboxEventsInApp.availableAt,
        correlationId: outboxEventsInApp.correlationId,
        createdAt: outboxEventsInApp.createdAt,
        eventType: outboxEventsInApp.eventType,
        id: outboxEventsInApp.id,
        schemaVersion: outboxEventsInApp.schemaVersion,
        status: outboxEventsInApp.status,
        tenantId: outboxEventsInApp.tenantId,
      });

    const persistedEvent = rows[0];
    if (persistedEvent === undefined) {
      throw new Error("Outbox insert completed without returning a row");
    }

    return persistedEvent;
  }
}
