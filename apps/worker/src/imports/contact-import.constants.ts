export const CONTACT_IMPORT_JOB_NAME = "contact-import.process";
export const CONTACT_IMPORT_QUEUE_NAME = "contact-imports";
export const CONTACT_IMPORT_WORKER_ENABLED = Symbol("CONTACT_IMPORT_WORKER_ENABLED");

export interface ContactImportJobData {
  readonly contactImportId: string;
}
