import { Customer, Plan } from "@/src/core/types";
import { DbCustomerWithPlan } from "..";

export function mapDbCustomerToCustomer(db: DbCustomerWithPlan): Customer {
    const plan: Plan | null = db.plans
        ? {
            id: db.plans.id,
            name: db.plans.name,
            price: db.plans.price != null ? Number(db.plans.price) : null,
            isCustomPrice: db.plans.is_custom_price,
            durationMonths: db.plans.duration_months,
            currencyId: db.plans.currency_id,
            branchId: db.plans.branch_id,
            tenantId: db.plans.tenant_id,
            createdAt: db.plans.created_at,
        }
        : null;

    return {
        id: db.id,
        name: db.name,
        phoneNumber: db.phone_number,
        address: db.address,
        area: db.area,
        notes: db.notes,
        active: db.active,
        isRegular: db.is_regular,
        planId: db.plan_id,
        branchId: db.branch_id,
        tenantId: db.tenant_id,
        startDate: db.start_date,
        cancelledAt: db.cancelled_at,
        createdAt: db.created_at,
        updatedAt: db.updated_at,
        plan,
    };
}