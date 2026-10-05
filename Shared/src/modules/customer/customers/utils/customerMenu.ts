import type { Currency, Customer, CustomerStatus } from "@shared/core/types";
import { canSendWhatsApp } from "@shared/core/utils/whatsappLink";
import { pickMenu, type MenuItem, type MenuTable } from "@shared/shared/lib/menuItem";
import { hasAnythingOwed } from "./customerFlags";
import { canQuickPay, fixedMonthItems, isMultiPlan } from "./quickPay";

export type CustomerActionKey =
  | "quick_pay"
  | "quick_pay_whatsapp"
  | "record_sale"
  | "add_custom_debt"
  | "collect"
  | "write_off_all"
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
  debtUsd: number | undefined;
  currencies: Currency[];
}

const MENU: MenuTable<CustomerActionKey> = {
  quick_pay: { group: "money", labelKey: "payments.quick_pay.menu_label" },
  quick_pay_whatsapp: { group: "money", labelKey: "invoice.pay_and_send_whatsapp" },
  record_sale: { group: "create", labelKey: "sales.record_button" },
  add_custom_debt: { group: "create", labelKey: "debts.add_custom_debt" },
  collect: { group: "money", labelKey: "ledger.collect_money" },
  write_off_all: {
    group: "danger",
    labelKey: "ledger.write_off_all",
    captionKey: "ledger.write_off_all_caption",
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
  const sendable = canSendWhatsApp(customer.phoneNumber);
  const keys: CustomerActionKey[] = [];
  if (canQuickPay(customer, money.status)) {
    keys.push("quick_pay");
    if (fixedMonthItems(customer, money.status, money.currencies).length > 0) {
      keys.push("quick_pay_whatsapp");
    }
  }
  keys.push("record_sale", "add_custom_debt");
  if (hasAnythingOwed(money.status, money.debtUsd)) keys.push("collect", "write_off_all");
  if (sendable) keys.push("whatsapp_chat");
  keys.push("edit", "history");
  const items = pickMenu(MENU, keys).map((item) => {
    if (item.key === "quick_pay_whatsapp" && !sendable) {
      return { ...item, disabled: true, captionKey: "invoice.no_phone" };
    }
    if (item.key === "quick_pay" && isMultiPlan(customer)) {
      return { ...item, labelKey: "payments.quick_pay.pay_unpaid_plans" };
    }
    return item;
  });
  return [...items, ...customerStatusItems(customer, viewer)];
}

// Pausing and deleting a customer are admin-only, wherever they are offered.
export function customerStatusItems(
  customer: Customer,
  viewer: Pick<CustomerMenuViewer, "isAdmin">,
): CustomerMenuItem[] {
  if (!viewer.isAdmin) return [];
  return pickMenu(MENU, [customer.active ? "deactivate" : "reactivate", "delete"]);
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
