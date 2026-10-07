import { useCallback } from "react";
import type { Customer } from "@shared/core/types";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import customerService from "@shared/modules/customer/customers/services/CustomerService";
import { resolveBranchFilter } from "@shared/shared/lib/branchFilter";
import { EntityPicker } from "@/shared/components/EntityPicker";

interface CustomerPickerProps {
  label: string;
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  placeholder?: string;
  required?: boolean;
  error?: string | null;
  size?: "small" | "medium";
  minWidth?: number;
}

// Searches the user's own scope, like the phone picker — not the header branch.
export function CustomerPicker({
  label,
  value,
  onChange,
  placeholder,
  required,
  error,
  size,
  minWidth,
}: CustomerPickerProps) {
  const { user } = useAuth();
  const search = useCallback(
    (term: string) => customerService.searchCustomers(0, term, resolveBranchFilter(user)),
    [user],
  );
  return (
    <EntityPicker<Customer>
      label={label}
      value={value}
      onChange={onChange}
      search={search}
      describe={(c) => ({ label: c.name, sublabel: c.phoneNumber ?? c.area ?? undefined })}
      getKey={(c) => c.id}
      placeholder={placeholder}
      required={required}
      error={error}
      size={size}
      minWidth={minWidth}
    />
  );
}
