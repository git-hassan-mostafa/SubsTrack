import type { SaleItem } from '@/src/core/types';
import type { CreateSaleItemPayload } from '../repository/ISaleRepository';
import type { CreateSaleItemInput } from './types';

/** A cart line that sells goods — the only kind stock cares about. */
export type ProductLineInput = Extract<CreateSaleItemInput, { kind: 'product' }>;

/**
 * What this line is called, whichever kind it is. The catalog name wins for a
 * catalog line; a one-off service falls back to the typed name, which IS the
 * record of what was sold. Frozen onto the row as `item_name_snapshot`.
 */
export function lineName(it: CreateSaleItemInput): string {
    if (it.kind === 'product') return it.product.name;
    return (it.service?.name ?? it.name).trim();
}

/**
 * How many units the line sells. A service is one job at one price — there is
 * nothing to count, so it is always 1 and the DB row stores 1. Every total, every
 * summary and every stock delta asks here instead of touching `.quantity`, which
 * only a product line has.
 */
export function lineQuantity(it: CreateSaleItemInput): number {
    return it.kind === 'product' ? it.quantity : 1;
}

/**
 * Only the lines that move stock. Every stock read/write goes through this rather
 * than testing a nullable id, so adding another non-stocked line kind cannot
 * silently slip into the ledger.
 */
export function productLines(items: CreateSaleItemInput[]): ProductLineInput[] {
    return items.filter((it): it is ProductLineInput => it.kind === 'product');
}

/** The saved counterpart: lines of an existing sale that took stock off a shelf. */
export function savedProductLines(
    items: SaleItem[],
): (SaleItem & { productId: string })[] {
    return items.filter(
        (it): it is SaleItem & { productId: string } =>
            it.lineType === 'product' && it.productId != null,
    );
}

/**
 * Units per product a cart takes off the shelf. The same product can sit on
 * several lines, and only the SUM per product matters to stock.
 */
export function cartUnits(items: CreateSaleItemInput[]): Map<string, number> {
    const units = new Map<string, number>();
    for (const it of productLines(items)) {
        units.set(it.product.id, (units.get(it.product.id) ?? 0) + it.quantity);
    }
    return units;
}

/** The saved counterpart: what a recorded sale is currently holding. */
export function savedUnits(items: SaleItem[]): Map<string, number> {
    const units = new Map<string, number>();
    for (const it of savedProductLines(items)) {
        units.set(it.productId, (units.get(it.productId) ?? 0) + it.quantity);
    }
    return units;
}

/**
 * How each product's on-hand moves when `before` units are replaced by `after` —
 * positive gives stock back, negative takes it. Recording a sale passes an empty
 * `before`, voiding one passes an empty `after`.
 */
export function stockDelta(
    before: Map<string, number>,
    after: Map<string, number>,
): Record<string, number> {
    const delta: Record<string, number> = {};
    for (const id of new Set([...before.keys(), ...after.keys()])) {
        const moved = (before.get(id) ?? 0) - (after.get(id) ?? 0);
        if (moved !== 0) delta[id] = moved;
    }
    return delta;
}

/** One cart line → the DB row. `sale_id` is filled in by the repository. */
export function toItemPayload(
    it: CreateSaleItemInput,
    tenantId: string,
): CreateSaleItemPayload {
    return {
        tenant_id: tenantId,
        line_type: it.kind,
        product_id: it.kind === 'product' ? it.product.id : null,
        service_id: it.kind === 'service' ? (it.service?.id ?? null) : null,
        item_name_snapshot: lineName(it),
        quantity: lineQuantity(it),
        unit_amount: it.unitAmount,
    };
}
