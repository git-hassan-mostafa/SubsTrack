import type {
  Currency,
  Product,
  Sale,
  SaleLineType,
  Service,
} from "@shared/core/types";
import { convert, findCurrency } from "@shared/core/utils/currency";
import { lineQuantity } from "./saleLines";
import type { CreateSaleItemInput } from "./types";

export interface CartRow {
  key: string;
  lineType: SaleLineType;
  productId: string | null;
  serviceId: string | null;
  customName: string;
  quantity: number;
  unitAmount: number | null;
}

// `name` is the frozen line name — the only record of a one-off service.
export interface SaleEditorInitial {
  items: {
    lineType: SaleLineType;
    productId: string | null;
    serviceId: string | null;
    name: string;
    quantity: number;
    unitAmount: number;
  }[];
  currencyId: string | null;
}

// `total` only SUGGESTS — the form owns the real one (gotcha #142).
export interface SaleCartDraft {
  lines: CreateSaleItemInput[];
  total: number;
  currency: Currency | null;
  currencyId: string | null;
  ready: boolean;
  dirty: boolean;
  signature: string;
}

export interface ResolvedCart {
  lines: CreateSaleItemInput[];
  total: number;
  ready: boolean;
}

export function editorInitial(sale: Sale): SaleEditorInitial {
  return {
    items: sale.items.map((it) => ({
      lineType: it.lineType,
      productId: it.productId,
      serviceId: it.serviceId,
      name: it.itemNameSnapshot,
      quantity: it.quantity,
      unitAmount: it.unitAmount,
    })),
    currencyId: sale.currencyId,
  };
}

// A product row needs its catalog row; a service row a pick or a typed name.
export function rowIsNamed(row: CartRow): boolean {
  return row.lineType === "product"
    ? row.productId != null
    : row.serviceId != null || row.customName.trim().length > 0;
}

// Unnamed rows are left out, so adding then removing a blank row is no edit.
export function cartSignature(rows: CartRow[], currencyId: string | null): string {
  const named = rows
    .filter(rowIsNamed)
    .map(
      (r) =>
        `${r.lineType}:${r.productId ?? ""}:${r.serviceId ?? ""}:${r.customName.trim()}:${r.quantity}:${r.unitAmount ?? ""}`,
    );
  return `${currencyId ?? ""}#${named.join("|")}`;
}

// A new sale starts with NO rows; zero rows is also a valid final state.
export function initialRows(initial: SaleEditorInitial | null): CartRow[] {
  if (!initial) return [];
  return initial.items.map((it, i) => ({
    key: `row-${i}`,
    lineType: it.lineType,
    productId: it.productId,
    serviceId: it.serviceId,
    customName:
      it.lineType === "service" && it.serviceId === null ? it.name : "",
    quantity: it.lineType === "service" ? 1 : it.quantity,
    unitAmount: it.unitAmount,
  }));
}

// A row's kind is fixed when it is made — see gotcha #101.
export function newCartRow(suffix: number, lineType: SaleLineType): CartRow {
  return {
    key: `row-${suffix}`,
    lineType,
    productId: null,
    serviceId: null,
    customName: "",
    quantity: 1,
    unitAmount: null,
  };
}

// Units an edited sale already holds still count as on the shelf for it.
export function stockCredit(
  initial: SaleEditorInitial | null,
): Map<string, number> {
  const credit = new Map<string, number>();
  for (const it of initial?.items ?? []) {
    if (it.lineType !== "product" || !it.productId) continue;
    credit.set(it.productId, (credit.get(it.productId) ?? 0) + it.quantity);
  }
  return credit;
}

// An inactive item stays pickable only on the sale that already sold it.
export function sellableProducts(
  products: Product[],
  credit: Map<string, number>,
): Product[] {
  return products.filter((p) => p.active || credit.has(p.id));
}

export function sellableServices(
  services: Service[],
  initial: SaleEditorInitial | null,
): Service[] {
  const used = new Set(
    (initial?.items ?? [])
      .map((it) => it.serviceId)
      .filter((id): id is string => id != null),
  );
  return services.filter((s) => s.active || used.has(s.id));
}

export function poolOf(product: Product, credit: Map<string, number>): number {
  return product.stockOnHand + (credit.get(product.id) ?? 0);
}

// The pool minus what OTHER rows already took of the same product.
export function availableFor(
  rows: CartRow[],
  key: string,
  product: Product | undefined,
  credit: Map<string, number>,
): number {
  if (!product) return 0;
  const takenElsewhere = rows
    .filter((r) => r.key !== key && r.productId === product.id)
    .reduce((sum, r) => sum + r.quantity, 0);
  return poolOf(product, credit) - takenElsewhere;
}

export function clampQuantity(quantity: number, available: number): number {
  return Math.min(Math.max(1, available), Math.max(1, quantity));
}

// A catalog price converted into the sale currency, rounded to its decimals.
export function priceIn(
  item: { price: number; currencyId: string | null },
  target: Currency | null,
  currencies: Currency[],
): number {
  const source = findCurrency(currencies, item.currencyId);
  const factor = 10 ** (target?.decimals ?? 2);
  return Math.round(convert(item.price, source, target) * factor) / factor;
}

// Not ready while any row is incomplete or a product is sold past its pool.
export function resolveCart(
  rows: CartRow[],
  products: Product[],
  services: Service[],
  credit: Map<string, number>,
): ResolvedCart {
  const lines: CreateSaleItemInput[] = [];
  let incomplete = false;
  for (const r of rows) {
    const line = resolveRow(r, products, services);
    if (line) lines.push(line);
    else incomplete = true;
  }
  const perProduct = new Map<string, number>();
  for (const l of lines) {
    if (l.kind !== "product") continue;
    perProduct.set(l.product.id, (perProduct.get(l.product.id) ?? 0) + l.quantity);
  }
  const oversold = [...perProduct].some(([id, qty]) => {
    const product = products.find((p) => p.id === id);
    return !product || poolOf(product, credit) < qty;
  });
  const total = lines.reduce(
    (sum, l) => sum + l.unitAmount * lineQuantity(l),
    0,
  );
  return { lines, total, ready: !incomplete && !oversold };
}

function resolveRow(
  r: CartRow,
  products: Product[],
  services: Service[],
): CreateSaleItemInput | null {
  if (r.unitAmount == null || !(r.unitAmount > 0) || r.quantity <= 0) return null;
  if (r.lineType === "product") {
    const product = products.find((p) => p.id === r.productId);
    return product
      ? { kind: "product", product, quantity: r.quantity, unitAmount: r.unitAmount }
      : null;
  }
  const service = services.find((s) => s.id === r.serviceId) ?? null;
  const name = service?.name ?? r.customName.trim();
  return name ? { kind: "service", service, name, unitAmount: r.unitAmount } : null;
}
