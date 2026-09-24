import { Customer } from "@/src/core/types";
import { mapDbCustomerPlanToCustomerPlan } from "@/src/modules/customer/customer-plans/utils/mapper";
import type { DbCustomerWithLines } from "../utils/types";

export function mapDbCustomerToCustomer(db: DbCustomerWithLines): Customer {
  return {
    id: db.id,
    name: db.name,
    phoneNumber: db.phone_number,
    address: db.address,
    area: db.area,
    notes: db.notes,
    locationUrl: db.location_url,
    active: db.active,
    isRegular: db.is_regular,
    branchId: db.branch_id,
    tenantId: db.tenant_id,
    cancelledAt: db.cancelled_at,
    portalPassword: db.portal_password,
    portalEnabled: db.portal_enabled,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
    customerPlans: (db.customer_plans ?? []).map(
      mapDbCustomerPlanToCustomerPlan,
    ),
  };
}
