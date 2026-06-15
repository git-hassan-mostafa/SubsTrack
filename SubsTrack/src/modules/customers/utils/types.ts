import { DbCustomer, DbPlan } from "@/src/core/types/db";

export type DbCustomerWithPlan = DbCustomer & { plans?: DbPlan | null };
