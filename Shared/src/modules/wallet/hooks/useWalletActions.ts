import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { UserWallet, WalletItem } from "@shared/core/types";
import { useWalletStore } from "@shared/modules/wallet/state/walletStore";
import {
  walletActConfirm,
  walletActionMode,
  type WalletConfirmCopy,
} from "@shared/modules/wallet/utils/walletView";
import { confirm } from "@shared/shared/lib/confirm";

// Every receive / close-out door, confirmed first; true once the cash moved.
export function useWalletActions() {
  const { t } = useTranslation();
  const receiveFrom = useWalletStore((s) => s.receiveFrom);
  const receiveAllFrom = useWalletStore((s) => s.receiveAllFrom);
  const closeOutItems = useWalletStore((s) => s.closeOutItems);
  const closeOutAll = useWalletStore((s) => s.closeOutAll);
  const [busyHolderId, setBusyHolderId] = useState<string | null>(null);

  async function confirmed(
    holderUserId: string,
    copy: WalletConfirmCopy,
    write: () => Promise<void>,
  ): Promise<boolean> {
    let moved = false;
    await confirm({
      title: t(copy.titleKey, copy.values),
      message: t(copy.messageKey, copy.values),
      confirmLabel: t(copy.confirmKey),
      onConfirm: async () => {
        setBusyHolderId(holderUserId);
        try {
          await write();
          moved = true;
        } finally {
          setBusyHolderId(null);
        }
      },
    });
    return moved;
  }

  async function actOnItems(
    wallet: UserWallet,
    items: WalletItem[],
  ): Promise<boolean> {
    const mode = walletActionMode(wallet);
    if (mode === "view" || items.length === 0) return false;
    const ids = items.map((item) => item.id);
    return confirmed(
      wallet.holderUserId,
      walletActConfirm(mode, { count: ids.length }),
      () =>
        mode === "close_out"
          ? closeOutItems(ids)
          : receiveFrom(wallet.holderUserId, ids),
    );
  }

  async function actOnAll(wallet: UserWallet): Promise<boolean> {
    const mode = walletActionMode(wallet);
    if (mode === "view") return false;
    return confirmed(
      wallet.holderUserId,
      walletActConfirm(mode, { holderName: wallet.holderName }),
      () =>
        mode === "close_out" ? closeOutAll() : receiveAllFrom(wallet.holderUserId),
    );
  }

  return { busyHolderId, actOnItems, actOnAll };
}
