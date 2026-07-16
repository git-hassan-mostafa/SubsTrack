import { TierCode, TierResource } from "@/src/core/types";

export interface TierLimitErrorPayload {
    resource: TierResource | "multi_currency" | "multi_month";
    limit: number | null;
    tierCode: TierCode;
}