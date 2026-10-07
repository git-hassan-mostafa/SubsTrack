import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBack from "@mui/icons-material/ArrowBack";
import { useWalletStore } from "@shared/modules/wallet/state/walletStore";
import { useEffectiveBranchFilter } from "@shared/shared/hooks/useEffectiveBranchFilter";
import { WalletDetail } from "../components/WalletDetail";
import { WalletHolderChips } from "../components/WalletHolderChips";
import { flipInRtl } from "@/app/theme/flipInRtl";

const WALLETS_PATH = "/admin/wallets";

// Receiving everything empties the wallet, so the page goes back to the list.
export function WalletDetailPage() {
  const { t } = useTranslation();
  const { holderId = "" } = useParams<{ holderId: string }>();
  const navigate = useNavigate();
  const branch = useEffectiveBranchFilter();
  const detail = useWalletStore((s) => (s.detail?.holderUserId === holderId ? s.detail : null));
  const loading = useWalletStore((s) => s.detailLoading);
  const error = useWalletStore((s) => s.error);
  const fetchDetail = useWalletStore((s) => s.fetchDetail);
  const clearDetail = useWalletStore((s) => s.clearDetail);
  const clearError = useWalletStore((s) => s.clearError);

  useEffect(() => {
    if (holderId) void fetchDetail(holderId);
  }, [holderId, branch, fetchDetail]);

  useEffect(() => clearDetail, [clearDetail]);

  const backLabel = t("web.wallet.back");

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        <Tooltip title={backLabel}>
          <IconButton href={WALLETS_PATH} aria-label={backLabel}>
            <ArrowBack sx={flipInRtl} />
          </IconButton>
        </Tooltip>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700, minWidth: 0 }} noWrap>
          {detail?.holderName ?? ""}
        </Typography>
        {detail ? <WalletHolderChips wallet={detail} /> : null}
      </Stack>
      <WalletDetail
        detail={detail}
        loading={loading}
        error={error}
        onDismissError={clearError}
        onReload={() => void fetchDetail(holderId)}
        onEmptied={() => void navigate(WALLETS_PATH)}
      />
    </Stack>
  );
}
