import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Collection, Sale } from "@shared/core/types";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import type { SelectionAction } from "@/src/shared/components/SelectionBar";
import {
  toActionMenuItems,
  toSelectionActions,
} from "@/src/shared/lib/menuActions";
import { SALE_ACTION_ICONS, SALE_RENDER_ICONS } from "./saleActionIcons";
import { BillHistorySheet, useCollectSheet } from "@/src/modules/ledger";
import { saleTitle } from "@shared/core/utils/receiptId";
import {
  saleCollectItem,
  saleMenuItems,
  saleSelectionItems,
  saleVoidTarget,
  type SaleActionKey,
  type SaleVoidTarget,
} from "@shared/modules/transaction/sales/utils/saleView";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useSendInvoice } from "@/src/modules/invoicing";
import { SaleBulkVoidSheet } from "../components/SaleBulkVoidSheet";
import type { SaleVoidResult } from "@shared/modules/transaction/sales/utils/types";

interface Options {
  onView: (sale: Sale) => void;
  onEdit: (sale: Sale) => void;
  onVoided?: (result: SaleVoidResult) => void;
  onCollected?: (collection: Collection) => void;
  onSelectionDone?: () => void;
}

export interface SaleActions {
  openMenu: (sale: Sale) => void;
  requestVoid: (sales: Sale[]) => void;
  selectionActions: (selected: Sale[]) => SelectionAction[];
  sheets: ReactNode;
}

// One ActionMenu per SCREEN, not per row: these lists are virtualized.
export function useSaleActions({
  onView,
  onEdit,
  onVoided,
  onCollected,
  onSelectionDone,
}: Options): SaleActions {
  const { t } = useTranslation();
  const { sendSales } = useSendInvoice();
  const { isAdmin } = useAuth();
  const collectSheet = useCollectSheet({ onCollected });
  const [menuSale, setMenuSale] = useState<Sale | null>(null);
  const [historySale, setHistorySale] = useState<Sale | null>(null);
  const [voidTarget, setVoidTarget] = useState<SaleVoidTarget | null>(null);

  // Synchronous: the bill rode in on the sale, so the sheet opens on the tap.
  function handleCollect(sale: Sale) {
    const item = saleCollectItem(sale);
    if (item) collectSheet.openOne(item.customerName, item);
  }

  function buildActions(sale: Sale | null): ActionMenuItem[] {
    if (!sale) return [];
    const run: Record<SaleActionKey, () => void> = {
      view: () => onView(sale),
      edit: () => onEdit(sale),
      collect: () => handleCollect(sale),
      invoice: () => void sendSales([sale]),
      history: () => setHistorySale(sale),
      void: () => setVoidTarget(saleVoidTarget([sale])),
    };
    return toActionMenuItems(saleMenuItems(sale, { isAdmin }), t, {
      icons: SALE_ACTION_ICONS,
      renderIcons: SALE_RENDER_ICONS,
      labelValues: { amount: "" },
      run,
    });
  }

  function requestVoid(sales: Sale[]) {
    const target = saleVoidTarget(sales);
    if (target.saleIds.length > 0) setVoidTarget(target);
  }

  return {
    openMenu: setMenuSale,
    requestVoid,
    selectionActions: (selected) =>
      toSelectionActions(saleSelectionItems(selected), t, {
        icons: SALE_ACTION_ICONS,
        renderIcons: SALE_RENDER_ICONS,
        run: {
          invoice: () =>
            void sendSales(selected).then((sent) => {
              if (sent) onSelectionDone?.();
            }),
          void: () => requestVoid(selected),
        },
      }),
    sheets: (
      <>
        <ActionMenu
          visible={menuSale !== null}
          title={menuSale?.itemsSummary}
          actions={buildActions(menuSale)}
          onDismiss={() => setMenuSale(null)}
        />

        {voidTarget ? (
          <SaleBulkVoidSheet
            saleIds={voidTarget.saleIds}
            chargeIds={voidTarget.chargeIds}
            onVoided={(result) => {
              setVoidTarget(null);
              onVoided?.(result);
            }}
            onDismiss={() => setVoidTarget(null)}
          />
        ) : null}

        {historySale ? (
          <BillHistorySheet
            targets={[{ table: "sales", recordId: historySale.id }]}
            chargeId={historySale.chargeId}
            subtitle={saleTitle(historySale.id, historySale.itemsSummary)}
            onDismiss={() => setHistorySale(null)}
          />
        ) : null}
        {collectSheet.sheet}
      </>
    ),
  };
}
