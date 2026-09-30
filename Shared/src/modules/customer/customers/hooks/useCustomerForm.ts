import { useEffect, useState } from "react";
import { BRANCH_FILTER_UNASSIGNED } from "@shared/core/constants";
import type { Customer } from "@shared/core/types";
import { useActiveBranches } from "@shared/modules/admin/branches/hooks/useActiveBranches";
import { defaultNewBranchId } from "@shared/modules/admin/branches/utils/defaultBranch";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import {
  useLineDrafts,
  type HardDeleteChoice,
  type LineDrafts,
} from "@shared/modules/customer/customer-plans/hooks/useLineDrafts";
import type { CustomerInput } from "@shared/modules/customer/customers/services/CustomerService";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";
import { useUiPrefStore } from "@shared/shared/lib/uiPrefStore";
import { useCustomerPlanSlice } from "@shared/state/hooks/useCustomerPlanSlice";
import { useCustomerSlice } from "@shared/state/hooks/useCustomerSlice";
import { usePlanSlice } from "@shared/state/hooks/usePlanSlice";

export type CustomerFormFields = {
  name: string;
  phoneNumber: string;
  address: string;
  area: string;
  notes: string;
  locationUrl: string;
  branchId: string | null;
  isRegular: boolean;
  portalEnabled: boolean;
  portalPassword: string;
};

export interface CustomerForm {
  form: CustomerFormFields;
  change: (patch: Partial<CustomerFormFields>) => void;
  lines: LineDrafts;
  dirty: boolean;
  canSubmit: boolean;
  submitting: boolean;
  error: string | null;
  clearError: () => void;
  submit: () => Promise<Customer | null>;
}

function fieldsOf(customer: Customer | null, branchId: string | null): CustomerFormFields {
  return {
    name: customer?.name ?? "",
    phoneNumber: customer?.phoneNumber ?? "",
    address: customer?.address ?? "",
    area: customer?.area ?? "",
    notes: customer?.notes ?? "",
    locationUrl: customer?.locationUrl ?? "",
    branchId,
    isRegular: customer?.isRegular ?? true,
    portalEnabled: customer?.portalEnabled ?? false,
    portalPassword: customer?.portalPassword ?? "",
  };
}

function inputOf(form: CustomerFormFields): CustomerInput {
  return {
    name: form.name,
    phoneNumber: form.phoneNumber || null,
    address: form.address || null,
    area: form.area || null,
    notes: form.notes || null,
    locationUrl: form.locationUrl || null,
    branchId: form.branchId,
    isRegular: form.isRegular,
    portalEnabled: form.portalEnabled,
    portalPassword: form.portalPassword || null,
  };
}

// Row first, then lines; a retry after a refused line edits, never re-creates.
export function useCustomerForm(
  customer: Customer | null,
  hardDeleteChoice: HardDeleteChoice,
): CustomerForm {
  const { user } = useAuth();
  const activeBranches = useActiveBranches();
  const currentBranchId = useUiPrefStore((s) => s.currentBranchId);
  const createCustomer = useCustomerSlice((s) => s.createCustomer);
  const updateCustomer = useCustomerSlice((s) => s.updateCustomer);
  const customerError = useCustomerSlice((s) => s.error);
  const clearCustomerError = useCustomerSlice((s) => s.clearError);
  const syncLines = useCustomerPlanSlice((s) => s.syncLines);
  const planError = useCustomerPlanSlice((s) => s.error);
  const clearPlanError = useCustomerPlanSlice((s) => s.clearError);
  const getPlans = usePlanSlice((s) => s.getPlans);
  const [form, setForm] = useState<CustomerFormFields>(() =>
    fieldsOf(
      customer,
      customer
        ? customer.branchId
        : (defaultNewBranchId(user, activeBranches) ??
            (currentBranchId === BRANCH_FILTER_UNASSIGNED ? null : currentBranchId)),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Customer | null>(null);
  const lines = useLineDrafts({ customer, branchId: form.branchId, hardDeleteChoice });
  const formDirty = useDirtyForm(form);

  useEffect(() => {
    clearCustomerError();
    clearPlanError();
    void getPlans();
    return () => {
      clearCustomerError();
      clearPlanError();
    };
  }, [clearCustomerError, clearPlanError, getPlans]);

  const clearError = () => {
    clearCustomerError();
    clearPlanError();
  };

  const change = (patch: Partial<CustomerFormFields>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    if (customerError || planError) clearError();
  };

  const submit = async (): Promise<Customer | null> => {
    if (!user || submitting) return null;
    setSubmitting(true);
    try {
      const drafted = lines.result();
      const target = customer ?? created;
      const saved = target
        ? await updateCustomer(target.id, inputOf(form))
        : await createCustomer(inputOf(form), user.tenantId, drafted.lines.length);
      if (!saved) return null;
      if (!target) setCreated(saved);
      const synced = await syncLines(
        target ?? saved,
        drafted.lines,
        customer ? drafted.removed : [],
        customer ? drafted.reactivated : [],
        user.tenantId,
      );
      return synced ? saved : null;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    form,
    change,
    lines,
    dirty: formDirty || lines.dirty,
    canSubmit: form.name.trim() !== "" && form.branchId !== null,
    submitting,
    error: customerError ?? planError,
    clearError,
    submit,
  };
}
