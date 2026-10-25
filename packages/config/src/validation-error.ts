export interface ConfigurationIssue {
  readonly key: string;
  readonly message: string;
}

/**
 * Reports invalid field names and constraints without including submitted values,
 * because environment values can contain credentials and encryption material.
 */
export class ConfigurationValidationError extends Error {
  public readonly issues: readonly ConfigurationIssue[];

  public constructor(issues: readonly ConfigurationIssue[]) {
    const details = issues.map((issue) => `- ${issue.key}: ${issue.message}`).join("\n");

    super(`Invalid runtime configuration:\n${details}`);
    this.name = "ConfigurationValidationError";
    this.issues = Object.freeze([...issues]);
  }
}
