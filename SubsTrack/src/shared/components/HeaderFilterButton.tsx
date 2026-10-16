import { useState } from "react";
import { useTranslation } from "react-i18next";
import { COLORS } from "@/src/shared/constants";
import { useUiPrefStore } from "@shared/shared/lib/uiPrefStore";
import { useCanPickBranch } from "@shared/modules/admin/branches/hooks/useCanPickBranch";
import { IconButton } from "./IconButton";
import { FiltersSheet, type ListFilters } from "./FiltersSheet";

interface Props {
  filters?: ListFilters;
  hideBranch?: boolean;
}

// The dot = something narrows this list, the app-wide branch included.
export function HeaderFilterButton({ filters, hideBranch = false }: Props) {
  const { t } = useTranslation();
  const canPickBranch = useCanPickBranch();
  const branchPicked = useUiPrefStore((s) => s.currentBranchId !== null);
  const [open, setOpen] = useState(false);

  const showBranch = canPickBranch && !hideBranch;
  if (!showBranch && !filters) return null;

  const narrowed = (showBranch && branchPicked) || !!filters?.active;

  return (
    <>
      <IconButton
        icon="filter-outline"
        onPress={() => setOpen(true)}
        accessibilityLabel={t("filters.title")}
        color={narrowed ? COLORS.primary : COLORS.gray700}
        badge={narrowed}
      />
      <FiltersSheet
        visible={open}
        onDismiss={() => setOpen(false)}
        showBranch={showBranch}
        filters={filters}
      />
    </>
  );
}
