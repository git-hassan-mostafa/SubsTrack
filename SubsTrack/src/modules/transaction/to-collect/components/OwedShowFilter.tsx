import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PillTabs, type PillTab } from "@/src/shared/components/PillTabs";
import {
  OWED_SHOW_LABEL_KEYS,
  type OwedShow,
} from "@shared/modules/transaction/to-collect/utils/toCollectView";

interface Props {
  value: OwedShow;
  onChange: (value: OwedShow) => void;
  className?: string;
}

export function OwedShowFilter({ value, onChange, className }: Props) {
  const { t } = useTranslation();

  const tabs: PillTab<OwedShow>[] = useMemo(
    () =>
      (Object.keys(OWED_SHOW_LABEL_KEYS) as OwedShow[]).map((key) => ({
        key,
        label: t(OWED_SHOW_LABEL_KEYS[key]),
      })),
    [t],
  );

  return (
    <PillTabs<OwedShow>
      value={value}
      onChange={onChange}
      tabs={tabs}
      className={className}
    />
  );
}
