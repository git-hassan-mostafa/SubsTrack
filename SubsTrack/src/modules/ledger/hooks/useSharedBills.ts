import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { collectionService } from "../services/CollectionService";
import { sharedBillsAcross } from "../utils/sharedBills";
import type { SharedBill } from "../utils/sharedBills";

/**
 * The OTHER bills a void would un-pay, for the bills about to be voided.
 *
 * A hand-over is voided whole, so voiding January can hand February back too —
 * naming them is what stops the confirm being skimmed (gotcha #125). Every void
 * door asks this the same way, so the read lives here and not in each dialog.
 *
 * `checking` gates the confirm button: offering the void before the answer
 * arrives is exactly how a warning gets missed.
 */
export function useSharedBills(chargeIds: string[]): {
  bills: SharedBill[];
  checking: boolean;
} {
  const { t } = useTranslation();
  const [bills, setBills] = useState<SharedBill[]>([]);
  const [checking, setChecking] = useState(chargeIds.length > 0);
  const key = chargeIds.join(",");

  useEffect(() => {
    let live = true;
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) {
      setBills([]);
      setChecking(false);
      return;
    }
    setChecking(true);
    void (async () => {
      try {
        const perCharge = await Promise.all(
          ids.map((id) => collectionService.getPaymentsForCharge(id)),
        );
        const open = perCharge.flat().filter((c) => c.voidedAt === null);
        const byId = new Map(open.map((c) => [c.id, c]));
        const found = sharedBillsAcross([...byId.values()], null, t).filter(
          (b) => !ids.includes(b.chargeId),
        );
        if (live) setBills(found);
      } catch {
      } finally {
        if (live) setChecking(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [key, t]);

  return { bills, checking };
}
