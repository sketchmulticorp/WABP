/** Browser-safe automation authoring contracts; no provider payloads or credentials. */
export type AutomationNodeType =
  "START" | "MESSAGE" | "BUTTONS" | "LIST" | "ASSIGN" | "CONTACT_UPDATE" | "HUMAN_HANDOFF" | "END";
export interface AutomationNode {
  readonly key: string;
  readonly type: AutomationNodeType;
  readonly config: Readonly<Record<string, unknown>>;
}
export interface AutomationEdge {
  readonly from: string;
  readonly to: string;
  readonly choice: string | null;
}
export interface AutomationGraph {
  readonly accountId: string;
  readonly keywords: readonly string[];
  readonly nodes: readonly AutomationNode[];
  readonly edges: readonly AutomationEdge[];
}
export interface AutomationVersion {
  readonly id: string;
  readonly number: number;
  readonly status: "DRAFT" | "PUBLISHED" | "RETIRED";
  readonly publishedAt: string | null;
  readonly graph: AutomationGraph;
}
export interface AutomationSummary {
  readonly id: string;
  readonly name: string;
  readonly status: "DRAFT" | "ACTIVE" | "PAUSED" | "RETIRED";
  readonly publishedVersionId: string | null;
  readonly updatedAt: string;
}
export interface AutomationDetail extends AutomationSummary {
  readonly revision: string;
  readonly versions: readonly AutomationVersion[];
}
export interface AutomationDraftInput {
  readonly name: string;
  readonly graph: AutomationGraph;
}
export interface AutomationSimulation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly steps: readonly { readonly key: string; readonly type: AutomationNodeType }[];
  readonly outcome: "INVALID" | "WAITING" | "HANDED_OFF" | "COMPLETED";
}
export interface AutomationOptions {
  readonly accounts: readonly {
    readonly id: string;
    readonly label: string;
    readonly status: string;
  }[];
  readonly members: readonly { readonly id: string; readonly label: string }[];
  readonly accountCursor: string | null;
  readonly memberCursor: string | null;
}
export interface ConversationAutomationStatus {
  readonly automationState: string;
  readonly run: {
    readonly runId: string;
    readonly status: string;
    readonly reason: string | null;
  } | null;
}
