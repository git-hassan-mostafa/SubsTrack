import { useTranslation } from "react-i18next";
import Stack from "@mui/material/Stack";
import type { UserWallet } from "@shared/core/types";
import { StatusChip } from "@/shared/components/StatusChip";

export function WalletHolderChips({ wallet }: { wallet: Pick<UserWallet, "isSelf" | "active"> }) {
  const { t } = useTranslation();
  if (!wallet.isSelf && wallet.active) return null;
  return (
    <Stack direction="row" spacing={0.5}>
      {wallet.isSelf ? <StatusChip tone="indigo" label={t("wallet.you")} /> : null}
      {!wallet.active ? <StatusChip tone="gray" label={t("common.inactive")} /> : null}
    </Stack>
  );
}
