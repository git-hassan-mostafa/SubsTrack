import {
  MIN_CUSTOMER_ALLOWANCE,
  MIN_CUSTOMER_REQUEST,
  QUOTA_KINDS,
  type QuotaKind,
  type QuotaPair,
} from "./types";

export interface AllowanceDraftInput {
  total: QuotaPair;
  limits: QuotaPair;
  active: QuotaPair;
  editing: boolean;
}

export interface AllowanceDraft {
  deltas: QuotaPair;
  extra: QuotaPair;
  raising: boolean;
  lowering: boolean;
  mixed: boolean;
  tooSmallRaise: boolean;
  belowMinimum: boolean;
  overCap: QuotaKind[];
  valid: boolean;
}

// Editing a pending request can only raise: the limits have not moved yet.
export function readAllowanceDraft({
  total,
  limits,
  active,
  editing,
}: AllowanceDraftInput): AllowanceDraft {
  const deltas: QuotaPair = {
    customers: total.customers - limits.customers,
    plans: total.plans - limits.plans,
  };
  const raising = QUOTA_KINDS.some((kind) => deltas[kind] > 0);
  const lowering = !editing && QUOTA_KINDS.some((kind) => deltas[kind] < 0);
  const mixed = raising && lowering;
  const tooSmallRaise =
    (editing || raising) &&
    deltas.customers + deltas.plans < MIN_CUSTOMER_REQUEST;
  const belowMinimum = !editing && total.customers < MIN_CUSTOMER_ALLOWANCE;
  const overCap = editing
    ? []
    : QUOTA_KINDS.filter((kind) => total[kind] < active[kind]);
  return {
    deltas,
    extra: {
      customers: Math.max(0, deltas.customers),
      plans: Math.max(0, deltas.plans),
    },
    raising,
    lowering,
    mixed,
    tooSmallRaise,
    belowMinimum,
    overCap,
    valid:
      (editing || raising || lowering) &&
      !mixed &&
      !belowMinimum &&
      !tooSmallRaise &&
      overCap.length === 0,
  };
}

export function openingAllowanceTotal(
  limits: QuotaPair,
  pendingAsk: QuotaPair,
): QuotaPair {
  return {
    customers: limits.customers + pendingAsk.customers,
    plans: limits.plans + pendingAsk.plans,
  };
}

// Lines can never be fewer than customers, so the line box rides up with it.
export function withCustomerTotal(
  total: QuotaPair,
  customers: number,
): QuotaPair {
  return { customers, plans: Math.max(total.plans, customers) };
}

export function allowanceFloor(
  kind: QuotaKind,
  total: QuotaPair,
  limits: QuotaPair,
  editing: boolean,
): number {
  if (editing) return limits[kind];
  return kind === "customers" ? MIN_CUSTOMER_ALLOWANCE : total.customers;
}
