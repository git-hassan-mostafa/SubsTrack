import type { Currency, Customer, CustomerStatus } from "@shared/core/types";
import { canSendWhatsApp } from "@shared/core/utils/whatsappLink";
import { ADMIN_ONLY, pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";
import { hasAnythingOwed } from "./customerFlags";
import { fixedMonthItems, isMultiPlan, quickPayBlockKey } from "./quickPay";

export type CustomerActionKey =
  | "quick_pay"
  | "quick_pay_whatsapp"
  | "record_sale"
  | "add_custom_debt"
  | "collect"
  | "write_off_everything"
  | "whatsapp_chat"
  | "edit"
  | "history"
  | "deactivate"
  | "reactivate"
  | "delete";

export type CustomerMenuItem = MenuItem<CustomerActionKey>;

export interface CustomerMenuViewer {
  isAdmin: boolean;
}

export interface CustomerMoneyFacts {
  status: CustomerStatus | null;
  toCollectUsd: number | undefined;
  currencies: Currency[];
}

const MENU: MenuTable<CustomerActionKey> = {
  quick_pay: { group: "money", labelKey: "payments.quick_pay.menu_label" },
  quick_pay_whatsapp: { group: "money", labelKey: "invoice.pay_and_send_whatsapp" },
  record_sale: { group: "create", labelKey: "sales.record_button" },
  add_custom_debt: { group: "create", labelKey: "debts.add_custom_debt" },
  collect: { group: "money", labelKey: "ledger.collect_money" },
  write_off_everything: {
    group: "danger",
    labelKey: "ledger.write_off_everything",
    captionKey: "ledger.write_off_everything_caption",
    destructive: true,
  },
  whatsapp_chat: { group: "send", labelKey: "invoice.open_whatsapp_chat" },
  edit: { group: "manage", labelKey: "common.edit" },
  history: { group: "history", labelKey: "audit.customer_history_action" },
  deactivate: { group: "status", labelKey: "customers.deactivate", destructive: true },
  reactivate: { group: "status", labelKey: "customers.activate" },
  delete: { group: "danger", labelKey: "common.delete", destructive: true },
};

// Pay-and-send needs a priced month: a typed amount has nothing to send yet.
export function customerMenuItems(
  customer: Customer,
  money: CustomerMoneyFacts,
  viewer: CustomerMenuViewer,
): CustomerMenuItem[] {
  const noPhone = !canSendWhatsApp(customer.phoneNumber) && "invoice.no_phone";
  const payBlock = quickPayBlockKey(customer, money.status);
  const typedOnly =
    !payBlock && fixedMonthItems(customer, money.status, money.currencies).length === 0;
  const nothingOwed =
    !hasAnythingOwed(money.status, money.toCollectUsd) && "why_disabled.nothing_owed";
  const keys: CustomerActionKey[] = [
    "quick_pay",
    "quick_pay_whatsapp",
    "record_sale",
    "add_custom_debt",
    "collect",
    "write_off_everything",
    "whatsapp_chat",
    "edit",
    "history",
  ];
  const items = pickMenu(MENU, keys, {
    quick_pay: payBlock,
    quick_pay_whatsapp: payBlock || (typedOnly && "why_disabled.no_set_price") || noPhone,
    collect: nothingOwed,
    write_off_everything: nothingOwed,
    whatsapp_chat: noPhone,
  }).map((item) =>
    item.key === "quick_pay" && isMultiPlan(customer)
      ? { ...item, labelKey: "payments.quick_pay.pay_unpaid_plans" }
      : item,
  );
  return [...items, ...customerStatusItems(customer, viewer)];
}

// The customer page reads no badge, so it always offers the write-off.
export function customerPageMoneyItems(): CustomerMenuItem[] {
  return pickMenu(MENU, ["write_off_everything"]);
}

// Pausing and deleting a customer are admin-only; staff see them greyed.
export function customerStatusItems(
  customer: Customer,
  viewer: Pick<CustomerMenuViewer, "isAdmin">,
): CustomerMenuItem[] {
  const adminOnly = !viewer.isAdmin && ADMIN_ONLY;
  return pickMenu(MENU, [customer.active ? "deactivate" : "reactivate", "delete"], {
    deactivate: adminOnly,
    reactivate: adminOnly,
    delete: adminOnly,
  });
}

// Edit and the active toggle need ONE customer; quick pay runs on many.
export function customerSelectionItems(
  selected: readonly Customer[],
  viewer: Pick<CustomerMenuViewer, "isAdmin">,
): CustomerMenuItem[] {
  if (selected.length === 0) return [];
  const one = selected.length === 1 ? selected[0] : null;
  const keys: CustomerActionKey[] = one ? ["edit", "quick_pay"] : ["quick_pay"];
  if (viewer.isAdmin && one) keys.push(one.active ? "deactivate" : "reactivate");
  if (viewer.isAdmin) keys.push("delete");
  return pickMenu(MENU, keys);
}
