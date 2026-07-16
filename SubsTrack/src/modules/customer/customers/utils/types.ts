import { DbCustomer } from "@/src/core/types/db";

// A customer row joined with its service lines (each carrying its plan), as
// returned by CustomerRepository (select '*, customer_plans(*, plans(*))').
export type DbCustomerWithLines = DbCustomer;
