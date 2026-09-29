import { useRef, useState } from "react";
import type { Currency, Product, StockMovement } from "@shared/core/types";
import { findCurrency } from "@shared/core/utils/currency";
import {
  totalFromUnitCost,
  unitFromTotalCost,
} from "@shared/modules/admin/products/utils/stockCost";
import { useDirtyForm } from "@shared/shared/hooks/useDirtyForm";

type CostChange = { amount: number | null; currencyId: string | null };

// The stock form: the unit and total cost fill each other from the quantity.
export function useStockEntryForm(
  product: Pick<Product, "costPrice" | "costCurrencyId">,
  currencies: Currency[],
) {
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [unitCost, setUnitCost] = useState<number | null>(product.costPrice);
  const [totalCost, setTotalCost] = useState<number | null>(null);
  const [costCurrencyId, setCostCurrencyId] = useState<string | null>(
    product.costCurrencyId,
  );
  const [editing, setEditing] = useState<StockMovement | null>(null);
  const costAnchor = useRef<"unit" | "total">("unit");
  const dirty = useDirtyForm({ quantity, note, unitCost, totalCost });

  const parsed = Number(quantity);
  const validQuantity = Number.isInteger(parsed) && parsed > 0;
  const adding = editing ? editing.quantityDelta > 0 : true;
  const costCurrency = findCurrency(currencies, costCurrencyId);
  const costEffect =
    validQuantity && totalCost != null && totalCost > 0 ? totalCost : null;

  const projectedStock = (onHand: number): number | null => {
    if (!validQuantity) return null;
    const base = editing ? onHand - editing.quantityDelta : onHand;
    return base + (adding ? parsed : -parsed);
  };

  const applyUnitCost = (unit: number | null, qty: number) => {
    costAnchor.current = "unit";
    setUnitCost(unit);
    setTotalCost(totalFromUnitCost(unit, qty));
  };

  const changeQuantity = (text: string) => {
    setQuantity(text);
    const qty = Number(text);
    if (qty <= 0) return;
    if (costAnchor.current === "total") {
      if (totalCost != null) setUnitCost(unitFromTotalCost(totalCost, qty));
    } else if (unitCost != null) {
      setTotalCost(totalFromUnitCost(unitCost, qty));
    }
  };

  const changeUnitCost = ({ amount, currencyId }: CostChange) => {
    setCostCurrencyId(currencyId);
    if (amount === unitCost) return;
    applyUnitCost(amount, parsed);
  };

  const changeTotalCost = ({ amount }: CostChange) => {
    if (amount === totalCost) return;
    costAnchor.current = "total";
    setTotalCost(amount);
    if (parsed > 0) setUnitCost(unitFromTotalCost(amount, parsed));
  };

  const reset = () => {
    setEditing(null);
    setQuantity("");
    setNote("");
    applyUnitCost(product.costPrice, 0);
    setCostCurrencyId(product.costCurrencyId);
  };

  const startEdit = (movement: StockMovement) => {
    const qty = Math.abs(movement.quantityDelta);
    setEditing(movement);
    setQuantity(String(qty));
    applyUnitCost(movement.unitCost, qty);
    setCostCurrencyId(movement.currencyId);
    setNote(movement.note ?? "");
  };

  return {
    quantity,
    note,
    unitCost,
    totalCost,
    costCurrencyId,
    costCurrency,
    editing,
    parsed,
    validQuantity,
    adding,
    costEffect,
    dirty,
    projectedStock,
    changeQuantity,
    changeUnitCost,
    changeTotalCost,
    setNote,
    reset,
    startEdit,
  };
}
