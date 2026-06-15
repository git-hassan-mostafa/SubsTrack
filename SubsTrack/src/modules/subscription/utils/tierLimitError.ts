import i18n from "@/src/core/i18n";
import { TierCode, TierResource } from "@/src/core/types";

export class TierLimitError extends Error {
    readonly resource: TierResource | 'multi_currency' | 'multi_month';
    readonly limit: number | null;
    readonly tierCode: TierCode;

    constructor(
        resource: TierLimitError['resource'],
        limit: number | null,
        tierCode: TierCode,
    ) {
        super(i18n.t('errors.tier_limit_reached', { resource, limit: limit ?? '∞' }));
        this.name = 'TierLimitError';
        this.resource = resource;
        this.limit = limit;
        this.tierCode = tierCode;
    }
}
