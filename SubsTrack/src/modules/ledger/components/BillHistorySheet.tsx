import { useTranslation } from "react-i18next";
import type { AuditRecordTarget } from "@shared/core/types";
import { HistorySheet } from "@/src/modules/admin/audit";
import { useBillHistory } from "@shared/modules/ledger/hooks/useBillHistory";

interface Props {
  targets?: AuditRecordTarget[];
  chargeId: string | null;
  subtitle?: string | null;
  onDismiss: () => void;
}

// A record's change timeline WITH its bill and the money on it, newest first.
export function BillHistorySheet({
  targets,
  chargeId,
  subtitle,
  onDismiss,
}: Props) {
  const { t } = useTranslation();
  const timeline = useBillHistory(chargeId, targets);

  return (
    <HistorySheet
      title={t("audit.record_history_title")}
      subtitle={subtitle}
      timeline={timeline}
      onDismiss={onDismiss}
    />
  );
}
