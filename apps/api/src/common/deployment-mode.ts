/** Server-owned profile token; browser requests cannot change deployment capabilities. */
export const DEPLOYMENT_MODE = Symbol("DEPLOYMENT_MODE");
export type DeploymentMode = "full" | "preview";
