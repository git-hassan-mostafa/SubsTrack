import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PillTabs, type PillTab } from "@/src/shared/components/PillTabs";
import type { DebtScope } from "../hooks/useWrittenOffDebts";

interface Props {
  value: DebtScope;
  onChange: (value: DebtScope) => void;
  className?: string;
}

/**
 * "Owed now" vs "Written off", as the pill tabs the customer list already uses.
 *
 * A debts list is read to answer what is still expected, so "Owed now" is the
 * default and written-off bills are something the reader asks for. It counts
 * nothing and waits for nothing, so it paints with the first frame.
 */
export function DebtScopeFilter({ value, onChange, className }: Props) {
  const { t } = useTranslation();

  const tabs: PillTab<DebtScope>[] = useMemo(
    () => [
      { key: "live", label: t("debts.scope_live") },
      { key: "written_off", label: t("debts.scope_written_off") },
    ],
    [t],
  );

  return (
    <PillTabs<DebtScope>
      value={value}
      onChange={onChange}
      tabs={tabs}
      className={className}
    />
  );
}
