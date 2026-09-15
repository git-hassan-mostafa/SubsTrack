import i18n from "@/src/core/i18n";

// The new limit sits below the customers already active — the admin must
// deactivate the difference first.
export class AllowanceFloorError extends Error {
    readonly requested: number;
    readonly activeCount: number;

    constructor(requested: number, activeCount: number) {
        super(
            i18n.t('billing.decrease_floor_error', {
                count: activeCount,
                requested,
                excess: activeCount - requested,
            }),
        );
        this.name = 'AllowanceFloorError';
        this.requested = requested;
        this.activeCount = activeCount;
    }
}
