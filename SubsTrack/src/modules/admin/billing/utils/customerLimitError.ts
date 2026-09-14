import i18n from "@/src/core/i18n";

export class CustomerLimitError extends Error {
    readonly allowance: number;
    readonly activeCount: number;

    constructor(allowance: number, activeCount: number) {
        super(i18n.t('errors.customer_limit_reached', { allowance, count: activeCount }));
        this.name = 'CustomerLimitError';
        this.allowance = allowance;
        this.activeCount = activeCount;
    }
}
