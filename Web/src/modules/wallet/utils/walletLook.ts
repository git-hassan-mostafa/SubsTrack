import type { SvgIconComponent } from "@mui/icons-material";
import DoneAllOutlined from "@mui/icons-material/DoneAllOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import type {
  WalletActionKey,
  WalletItemActionKey,
} from "@shared/modules/wallet/utils/walletView";

export const WALLET_ACTION_ICONS: Record<WalletActionKey, SvgIconComponent> = {
  act_all: DoneAllOutlined,
  blocked: LockOutlined,
};

export const WALLET_ITEM_ACTION_ICONS: Record<WalletItemActionKey, SvgIconComponent> = {
  details: ReceiptLongOutlined,
  act: DoneAllOutlined,
};
