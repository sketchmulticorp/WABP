/** Uses the existing plan flag; no new commercial limits or grace policy are introduced. */
export function automationEnabled(
  value:
    { status: string; planStatus: string; flags: Readonly<Record<string, unknown>> } | undefined,
) {
  return (
    value !== undefined &&
    ["ACTIVE", "TRIAL"].includes(value.status) &&
    value.planStatus === "ACTIVE" &&
    value.flags.automation_enabled === true
  );
}
