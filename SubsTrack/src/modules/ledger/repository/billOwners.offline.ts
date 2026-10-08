import type { SQLiteDatabase } from "expo-sqlite";
import type { DbCharge } from "@shared/core/types/db";
import type { CreateChargePayload } from "@shared/modules/ledger/repository/IChargeRepository";
import {
  monthBillKey,
  resolveBillTarget,
} from "@shared/modules/ledger/repository/chargeRevive";
import { decodeRow } from "@/src/core/offline/db/codec";

async function chargeWhere(
  db: SQLiteDatabase,
  where: string,
  params: unknown[],
): Promise<DbCharge | null> {
  const raw = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM charges WHERE ${where}`,
    params as never[],
  );
  return raw ? decodeRow<DbCharge>("charges", raw) : null;
}

// The mirror's side of `resolveBillTarget`, read inside the write that acts on it.
export async function billTargetIn(
  db: SQLiteDatabase,
  charge: CreateChargePayload,
): Promise<ReturnType<typeof resolveBillTarget>> {
  const byKey = monthBillKey(charge)
    ? await chargeWhere(db, "customer_plan_id = ? AND billing_month = ?", [
        charge.customer_plan_id,
        charge.billing_month,
      ])
    : null;
  const byId = await chargeWhere(db, "id = ?", [charge.id]);
  return resolveBillTarget(charge, byKey, byId);
}

export async function paidOnIn(
  db: SQLiteDatabase,
  chargeId: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    "SELECT SUM(ci.amount) AS total FROM collection_items ci " +
      "JOIN collections c ON c.id = ci.collection_id " +
      "WHERE ci.charge_id = ? AND c.voided_at IS NULL",
    [chargeId] as never[],
  );
  return Number(row?.total ?? 0);
}
