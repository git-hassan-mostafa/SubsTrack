import i18n from "@/src/core/i18n";
import type { QuotaKind } from "./types";

const MESSAGE_KEYS: Record<QuotaKind, string> = {
    customers: 'billing.decrease_floor_error_customers',
    plans: 'billing.decrease_floor_error_plans',
};

// The new limit sits below what is already active — the admin must deactivate
// the difference first.
export class AllowanceFloorError extends Error {
    readonly kind: QuotaKind;
    readonly requested: number;
    readonly activeCount: number;

    constructor(kind: QuotaKind, requested: number, activeCount: number) {
        super(
            i18n.t(MESSAGE_KEYS[kind], {
                count: activeCount,
                requested,
                excess: activeCount - requested,
            }),
        );
        this.name = 'AllowanceFloorError';
        this.kind = kind;
        this.requested = requested;
        this.activeCount = activeCount;
    }
}
