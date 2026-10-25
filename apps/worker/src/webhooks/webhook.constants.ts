export const WORKER_DATABASE_POOL = Symbol("WORKER_DATABASE_POOL");
export const WORKER_RUNTIME_CONFIG = Symbol("WORKER_RUNTIME_CONFIG");
export const WEBHOOK_WORKER_ENABLED = Symbol("WEBHOOK_WORKER_ENABLED");
export const WEBHOOK_QUEUE_NAME = "webhook-events";
export const WEBHOOK_JOB_NAME = "process-webhook-event";

export interface WebhookJobData {
  readonly webhookEventId: string;
}
