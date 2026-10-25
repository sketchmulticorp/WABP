export const MESSAGE_JOB_NAME = "outbound-message.process";
export const MESSAGE_QUEUE_NAME = "outbound-messages";
export const MESSAGE_WORKER_ENABLED = Symbol("MESSAGE_WORKER_ENABLED");
export const MESSAGE_PROVIDER = Symbol("MESSAGE_PROVIDER");
export const MESSAGE_RELAY_ENABLED = Symbol("MESSAGE_RELAY_ENABLED");

export interface MessageJobData {
  readonly messageId: string;
}
