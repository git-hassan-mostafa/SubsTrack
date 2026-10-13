import type { Glyph } from "@/src/shared/lib/menuActions";
import type { OwingCustomerActionKey } from "@shared/modules/transaction/to-collect/utils/toCollectView";

export const OWING_CUSTOMER_ACTION_ICONS: Record<OwingCustomerActionKey, Glyph> = {
  collect_all: "cash-outline",
  write_off_all: "remove-circle-outline",
};
