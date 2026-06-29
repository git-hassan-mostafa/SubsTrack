import { Customer } from "@/src/core/types";
import { mapDbCustomerPlanToCustomerPlan } from "@/src/modules/customer-plans";
import { DbCustomerWithLines } from "..";

export function mapDbCustomerToCustomer(db: DbCustomerWithLines): Customer {
    return {
        id: db.id,
        name: db.name,
        phoneNumber: db.phone_number,
        address: db.address,
        area: db.area,
        notes: db.notes,
        active: db.active,
        isRegular: db.is_regular,
        branchId: db.branch_id,
        tenantId: db.tenant_id,
        startDate: db.start_date,
        cancelledAt: db.cancelled_at,
        createdAt: db.created_at,
        updatedAt: db.updated_at,
        customerPlans: (db.customer_plans ?? []).map(mapDbCustomerPlanToCustomerPlan),
    };
}
