import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { useSalesTable } from "@/state/salesTable";
import { SalesTable } from "./SalesTable";

// Every sale in the header's branch, server paged; voided ones only on request.
export function SalesPage() {
  const branch = useEffectiveBranchFilter();
  return <SalesTable table={useSalesTable} branch={branch} />;
}
