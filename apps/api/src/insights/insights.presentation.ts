import type { InsightPage, InsightPeriod, UsageSummary } from "@whatsapp-platform/contracts";
import type { SubscriptionProjection } from "./insights.types.js";
import { insightCursor } from "./insights.dto.js";

export function currentMonth(): InsightPeriod {
  const now = new Date();
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
  };
}
export function usageSummary(
  period: InsightPeriod,
  data: { reserved: number; subscription: SubscriptionProjection | undefined },
): UsageSummary {
  const s = data.subscription,
    ambiguousSubscription = (s?.eligibleCount ?? 0) > 1;
  const configured = s?.limits.monthly_message_limit;
  const messageLimit =
    s?.eligible === true &&
    !ambiguousSubscription &&
    typeof configured === "number" &&
    Number.isSafeInteger(configured) &&
    configured >= 0
      ? configured
      : null;
  return {
    period,
    reservedMessages: data.reserved,
    messageLimit,
    remainingMessages: messageLimit === null ? null : Math.max(0, messageLimit - data.reserved),
    ambiguousSubscription,
    subscription:
      s === undefined
        ? null
        : {
            status: s.status,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            eligible: s.eligible && !ambiguousSubscription,
            planName: s.planName,
            planCode: s.planCode,
            planStatus: s.planStatus,
          },
  };
}
export function insightPage<T>(
  rows: readonly T[],
  limit: number,
  position: (item: T) => { at: string; id: string },
): InsightPage<T> {
  const items = rows.slice(0, limit),
    last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last !== undefined
        ? insightCursor(position(last).at, position(last).id)
        : null,
  };
}
