import { useCurrencyStore } from "@/src/modules/currencies/store/currencyStore";
import { useBranchStore } from "@/src/modules/branches/store/branchStore";
import { usePlanStore } from "@/src/modules/plans/store/planStore";
import { useUserStore } from "@/src/modules/users/store/userStore";
import { useCustomerStore } from "@/src/modules/customers/store/customerStore";
import { usePaymentStore } from "@/src/modules/customer-payments/store/paymentStore";
import { useDashboardStore } from "@/src/modules/dashboard/store/dashboardStore";

export function resetAllDomainStores() {
  useCurrencyStore.getState().reset();
  useBranchStore.getState().reset();
  usePlanStore.getState().reset();
  useUserStore.getState().reset();
  useCustomerStore.getState().reset();
  usePaymentStore.getState().reset();
  useDashboardStore.getState().reset();
}
