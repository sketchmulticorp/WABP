export const CAMPAIGN_PREFLIGHT_JOB_NAME = "campaign-preflight.process";
export const CAMPAIGN_PREFLIGHT_QUEUE_NAME = "campaign-preflights";
export const CAMPAIGN_PREFLIGHT_WORKER_ENABLED = Symbol("CAMPAIGN_PREFLIGHT_WORKER_ENABLED");

export interface CampaignPreflightJobData {
  readonly preflightRunId: string;
}
