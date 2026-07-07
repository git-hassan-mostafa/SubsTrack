import { useCallback } from "react";
import type { Customer } from "@/src/core/types";
import {
  AsyncEntityPicker,
  type AsyncEntityPickerTriggerStyle,
} from "@/src/shared/components/AsyncEntityPicker";
import { useAuth } from "@/src/modules/auth";
import { resolveBranchFilter } from "@/src/shared/lib/branchFilter";
import customerService from "../services/CustomerService";

interface CustomerPickerProps {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  label?: string;
  placeholder?: string;
  nullable?: boolean;
  nullLabel?: string;
  disabled?: boolean;
  triggerStyle?: AsyncEntityPickerTriggerStyle;
  onAddNew?: () => void;
}

export function CustomerPicker({
  value,
  onChange,
  label,
  placeholder,
  nullable,
  nullLabel,
  disabled,
  triggerStyle,
  onAddNew,
}: CustomerPickerProps) {
  const { user } = useAuth();

  const loadPage = useCallback(
    async (search: string, page: number) => {
      const result = await customerService.getCustomers(
        page,
        search,
        resolveBranchFilter(user),
      );
      return result.customers;
    },
    [user],
  );

  return (
    <AsyncEntityPicker<Customer>
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      loadPage={loadPage}
      renderItem={(c) => ({
        label: c.name,
        sublabel: c.phoneNumber ?? c.area ?? undefined,
      })}
      getKey={(c) => c.id}
      nullable={nullable}
      nullLabel={nullLabel}
      disabled={disabled}
      triggerStyle={triggerStyle}
      onAddNew={onAddNew}
    />
  );
}
