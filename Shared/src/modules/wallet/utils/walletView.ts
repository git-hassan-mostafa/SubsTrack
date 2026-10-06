import type { ReceiveBlock, UserWallet, WalletSource } from "@shared/core/types";
import type { MenuItem } from "@shared/shared/lib/menuItem";

export type WalletActionMode = "view" | "receive" | "close_out";

export type WalletActMode = Exclude<WalletActionMode, "view">;

export type WalletActionKey = "act_all" | "blocked";

export type WalletItemActionKey = "details" | "act";

export interface WalletConfirmCopy {
  titleKey: string;
  messageKey: string;
  confirmKey: string;
  values?: Record<string, unknown>;
}

export type WalletActScope = { count: number } | { holderName: string };

type WalletRights = Pick<UserWallet, "receiveBlock" | "canCloseOut">;

export const WALLET_SOURCES: readonly WalletSource[] = [
  "month",
  "sale",
  "manual",
  "mixed",
];

export const WALLET_SOURCE_LABEL_KEY: Record<WalletSource, string> = {
  month: "wallet.source_payment",
  sale: "wallet.source_sale",
  manual: "wallet.source_debt",
  mixed: "wallet.source_mixed",
};

const BLOCK_LABEL_KEY: Record<Exclude<ReceiveBlock, null>, string> = {
  self: "wallet.cannot_receive_self",
  rank: "wallet.cannot_receive_rank",
  branch: "wallet.cannot_receive_branch",
};

const ACT_LABEL_KEY: Record<WalletActMode, { one: string; all: string }> = {
  receive: { one: "wallet.receive", all: "wallet.receive_all" },
  close_out: { one: "wallet.close_out", all: "wallet.close_out_all" },
};

// The rights come from WalletService (custody.ts); a wallet not read yet is look-only.
export function walletActionMode(wallet: WalletRights | null): WalletActionMode {
  if (!wallet) return "view";
  if (wallet.receiveBlock === null) return "receive";
  if (wallet.canCloseOut) return "close_out";
  return "view";
}

export function walletActLabelKey(mode: WalletActMode, all: boolean): string {
  return all ? ACT_LABEL_KEY[mode].all : ACT_LABEL_KEY[mode].one;
}

export function receiveBlockLabelKey(block: ReceiveBlock): string {
  return BLOCK_LABEL_KEY[block ?? "rank"];
}

// A look-only wallet still names why, so the menu is never silently empty.
export function walletMenuItems(wallet: WalletRights): MenuItem<WalletActionKey>[] {
  const mode = walletActionMode(wallet);
  if (mode === "view") {
    return [
      {
        key: "blocked",
        group: "manage",
        labelKey: receiveBlockLabelKey(wallet.receiveBlock),
        disabled: true,
      },
    ];
  }
  return [{ key: "act_all", group: "money", labelKey: walletActLabelKey(mode, true) }];
}

export function walletItemMenuItems(
  mode: WalletActionMode,
): MenuItem<WalletItemActionKey>[] {
  const details: MenuItem<WalletItemActionKey> = {
    key: "details",
    group: "open",
    labelKey: "ledger.payment_details",
  };
  return mode === "view" ? [details] : [details, ...walletSelectionItems(mode)];
}

export function walletSelectionItems(
  mode: WalletActionMode,
): MenuItem<WalletItemActionKey>[] {
  if (mode === "view") return [];
  return [{ key: "act", group: "money", labelKey: walletActLabelKey(mode, false) }];
}

export function cashOnHandUsd(wallets: Pick<UserWallet, "totalUsd">[]): number {
  return wallets.reduce((sum, wallet) => sum + wallet.totalUsd, 0);
}

export function walletActConfirm(
  mode: WalletActMode,
  scope: WalletActScope,
): WalletConfirmCopy {
  const all = "holderName" in scope;
  if (mode === "close_out") {
    return all
      ? {
          titleKey: "wallet.close_out_all_confirm_title",
          messageKey: "wallet.close_out_all_confirm_message",
          confirmKey: "wallet.close_out_all",
        }
      : {
          titleKey: "wallet.close_out_confirm_title",
          messageKey: "wallet.close_out_confirm_message",
          confirmKey: "wallet.close_out",
          values: { count: scope.count },
        };
  }
  if (all) {
    return {
      titleKey: "wallet.receive_all_confirm_title",
      messageKey: "wallet.receive_all_confirm_message",
      confirmKey: "wallet.receive_all",
      values: { name: scope.holderName },
    };
  }
  return {
    titleKey: "wallet.receive_confirm_title",
    messageKey:
      scope.count === 1
        ? "wallet.receive_confirm_message"
        : "wallet.receive_selected_confirm_message",
    confirmKey: "wallet.receive",
    values: { count: scope.count },
  };
}
