import type { WhatsAppMessage } from "@shared/core/types";
import {
  isFacebookOrigin,
  isSignupPin,
  readSignupEvent,
} from "@shared/modules/whatsapp/utils/embeddedSignup";
import {
  headerReminderKey,
  selectionSendPurpose,
  whatsAppCustomerItems,
  whatsAppMessageItems,
  whatsAppSelectionItems,
  type WhatsAppMenuFacts,
} from "@shared/modules/whatsapp/utils/whatsappMenu";
import {
  messageTitle,
  recentlySentCustomers,
  skipReasonCounts,
} from "@shared/modules/whatsapp/utils/whatsappView";
import { ADMIN_ONLY, type MenuItem } from "@shared/shared/lib/menuItem";
import { customer, line } from "../helpers/factories";

// TC-WA-D-* — the WhatsApp doors both apps draw, and the signup page's trust rules.
const keysOf = <K extends string>(items: MenuItem<K>[]) => items.map((item) => item.key);
const t = (key: string) => key;

const CONNECTED: WhatsAppMenuFacts = {
  isAdmin: true,
  ready: true,
  reminderReady: true,
  renewalReady: true,
  optedOutIds: new Set(),
};

const PREPAID_LINE = line({ id: "line-pre", prepaid: true });
const POSTPAID_LINE = line({ id: "line-post" });
const prepaidCustomer = (over: Parameters<typeof customer>[0] = {}) =>
  customer({ customerPlans: [PREPAID_LINE], ...over });

function message(over: Partial<WhatsAppMessage> = {}): WhatsAppMessage {
  return {
    id: "m1",
    customerId: "cust-1",
    customerName: "Ali",
    batchId: "b1",
    templateName: "own_template",
    purpose: null,
    status: "sent",
    errorKey: null,
    errorCode: null,
    errorTitle: null,
    createdAt: "2026-03-01T10:00:00.000Z",
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    ...over,
  };
}

describe("WhatsApp customer menu", () => {
  it("TC-WA-D-01 a non-admin sees every WhatsApp door greyed as admin-only", () => {
    const items = whatsAppCustomerItems(customer(), { ...CONNECTED, isAdmin: false });
    expect(keysOf(items)).toEqual(["whatsapp_reminder", "whatsapp_message", "whatsapp_stop"]);
    expect(items.every((item) => item.disabled && item.captionKey === ADMIN_ONLY)).toBe(true);
    expect(whatsAppSelectionItems([customer()], { ...CONNECTED, isAdmin: false })).toEqual([]);
  });

  it("TC-WA-D-02 not connected leaves only the wa.me reminder, and only with a phone", () => {
    const offline = { ...CONNECTED, ready: false };
    const items = whatsAppCustomerItems(customer(), offline);
    expect(keysOf(items)).toEqual(["whatsapp_reminder"]);
    expect(items[0]).toMatchObject({ captionKey: "whatsapp.opens_whatsapp" });
    expect(items[0].disabled).toBeFalsy();
    expect(whatsAppCustomerItems(customer({ phoneNumber: null }), offline)).toEqual([
      expect.objectContaining({ key: "whatsapp_reminder", disabled: true, captionKey: "invoice.no_phone" }),
    ]);
    expect(whatsAppSelectionItems([customer()], offline)).toEqual([]);
  });

  it("TC-WA-D-03 connected offers reminder, message and stop", () => {
    const items = whatsAppCustomerItems(customer(), CONNECTED);
    expect(keysOf(items)).toEqual(["whatsapp_reminder", "whatsapp_message", "whatsapp_stop"]);
    expect(items.every((item) => !item.disabled)).toBe(true);
  });

  it("TC-WA-D-04 an opted-out customer can be allowed again but not messaged", () => {
    const items = whatsAppCustomerItems(customer(), { ...CONNECTED, optedOutIds: new Set(["cust-1"]) });
    expect(keysOf(items)).toEqual(["whatsapp_reminder", "whatsapp_message", "whatsapp_allow"]);
    expect(items[0]).toMatchObject({ disabled: true, captionKey: "whatsapp.opted_out_caption" });
    expect(items[1]).toMatchObject({ disabled: true, captionKey: "whatsapp.opted_out_caption" });
    expect(items[2].disabled).toBeFalsy();
  });

  it("TC-WA-D-05 no phone blocks every send and the stop toggle", () => {
    const items = whatsAppCustomerItems(customer({ phoneNumber: null }), CONNECTED);
    expect(items.every((item) => item.disabled)).toBe(true);
    expect(items[0]).toMatchObject({ captionKey: "invoice.no_phone" });
  });

  it("TC-WA-D-06 the reminder waits for Meta's approval; a free message does not", () => {
    const items = whatsAppCustomerItems(customer(), { ...CONNECTED, reminderReady: false });
    expect(items[0]).toMatchObject({ disabled: true, captionKey: "whatsapp.template_pending" });
    expect(items[1].disabled).toBeFalsy();
  });

  it("TC-WA-D-07 a selection sends only when connected and not empty", () => {
    expect(keysOf(whatsAppSelectionItems([customer()], CONNECTED))).toEqual(["whatsapp_send"]);
    expect(whatsAppSelectionItems([], CONNECTED)).toEqual([]);
  });

  it("TC-WA-D-16 only a customer with an active prepaid line gets the renewal reminder", () => {
    expect(keysOf(whatsAppCustomerItems(prepaidCustomer(), CONNECTED))).toEqual([
      "whatsapp_reminder",
      "whatsapp_renewal",
      "whatsapp_message",
      "whatsapp_stop",
    ]);
    expect(keysOf(whatsAppCustomerItems(customer({ customerPlans: [POSTPAID_LINE] }), CONNECTED))).not.toContain(
      "whatsapp_renewal",
    );
    const stopped = prepaidCustomer({ customerPlans: [{ ...PREPAID_LINE, active: false }] });
    expect(keysOf(whatsAppCustomerItems(stopped, CONNECTED))).not.toContain("whatsapp_renewal");
  });

  it("TC-WA-D-17 the renewal reminder waits for its own template and opens wa.me when not connected", () => {
    const pending = whatsAppCustomerItems(prepaidCustomer(), { ...CONNECTED, renewalReady: false });
    expect(pending[1]).toMatchObject({ key: "whatsapp_renewal", disabled: true, captionKey: "whatsapp.template_pending" });
    expect(pending[0].disabled).toBeFalsy();
    const offline = whatsAppCustomerItems(prepaidCustomer(), { ...CONNECTED, ready: false });
    expect(keysOf(offline)).toEqual(["whatsapp_reminder", "whatsapp_renewal"]);
    expect(offline.every((item) => item.captionKey === "whatsapp.opens_whatsapp" && !item.disabled)).toBe(true);
  });

  it("TC-WA-D-18 an all-prepaid selection starts on the renewal reminder; any other on the payment one", () => {
    const mixed = customer({ id: "cust-2", customerPlans: [PREPAID_LINE, POSTPAID_LINE] });
    expect(selectionSendPurpose([prepaidCustomer()], CONNECTED)).toBe("renewal_reminder");
    expect(selectionSendPurpose([prepaidCustomer(), mixed], CONNECTED)).toBe("payment_reminder");
    expect(selectionSendPurpose([prepaidCustomer()], { ...CONNECTED, renewalReady: false })).toBe("payment_reminder");
    expect(selectionSendPurpose([mixed], { ...CONNECTED, reminderReady: false })).toBeNull();
    expect(selectionSendPurpose([], CONNECTED)).toBe("payment_reminder");
  });

  it("TC-WA-D-19 the customer page header offers the renewal reminder only to an all-prepaid customer", () => {
    expect(headerReminderKey(prepaidCustomer())).toBe("whatsapp_renewal");
    expect(headerReminderKey(customer({ customerPlans: [PREPAID_LINE, POSTPAID_LINE] }))).toBe("whatsapp_reminder");
    expect(headerReminderKey(customer())).toBe("whatsapp_reminder");
  });
});

describe("WhatsApp message history", () => {
  it("TC-WA-D-08 only a queued message can cancel its send", () => {
    expect(keysOf(whatsAppMessageItems(message({ status: "queued" })))).toEqual(["cancel_batch"]);
    for (const status of ["sending", "sent", "delivered", "read", "failed", "cancelled", "unknown"] as const) {
      expect(whatsAppMessageItems(message({ status }))).toEqual([]);
    }
  });

  it("TC-WA-D-09 a Sijil template reads as its purpose, a tenant one as its name", () => {
    expect(messageTitle(message(), t)).toBe("own_template");
  });

  it("TC-WA-D-10 the send summary counts skips and offers only 24-hour skips again", () => {
    const skipped = [
      { customerId: "a", reason: "recently_sent" as const },
      { customerId: "b", reason: "no_phone" as const },
      { customerId: "c", reason: "recently_sent" as const },
    ];
    expect(skipReasonCounts(skipped)).toEqual([
      ["recently_sent", 2],
      ["no_phone", 1],
    ]);
    const customers = ["a", "b", "c", "d"].map((id) => customer({ id }));
    expect(recentlySentCustomers(skipped, customers).map((c) => c.id)).toEqual(["a", "c"]);
  });
});

describe("Embedded Signup page", () => {
  it("TC-WA-D-11 trusts only facebook.com and its subdomains", () => {
    expect(isFacebookOrigin("https://www.facebook.com")).toBe(true);
    expect(isFacebookOrigin("https://facebook.com")).toBe(true);
    expect(isFacebookOrigin("https://evilfacebook.com")).toBe(false);
    expect(isFacebookOrigin("https://facebook.com.evil.io")).toBe(false);
    expect(isFacebookOrigin("not a url")).toBe(false);
  });

  it("TC-WA-D-12 a signup message from anywhere else is ignored", () => {
    const data = { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "1", phone_number_id: "2" } };
    expect(readSignupEvent("https://evil.example", data)).toBeNull();
  });

  it("TC-WA-D-13 FINISH events carry the account; the app-onboarding one is coexistence", () => {
    const origin = "https://www.facebook.com";
    const cloud = readSignupEvent(origin, JSON.stringify({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      data: { waba_id: "w", phone_number_id: "p", business_id: "b" },
    }));
    expect(cloud).toEqual({
      kind: "finished",
      details: { wabaId: "w", phoneNumberId: "p", businessId: "b", flow: "cloud" },
    });
    const coexistence = readSignupEvent(origin, {
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      data: { waba_id: "w", phone_number_id: "p" },
    });
    expect(coexistence).toMatchObject({ kind: "finished", details: { flow: "coexistence", businessId: null } });
  });

  it("TC-WA-D-14 finishing without a number never reaches the server", () => {
    const origin = "https://www.facebook.com";
    expect(readSignupEvent(origin, { type: "WA_EMBEDDED_SIGNUP", event: "FINISH_ONLY_WABA", data: {} })).toEqual({
      kind: "no_number",
    });
    expect(
      readSignupEvent(origin, { type: "WA_EMBEDDED_SIGNUP", event: "ERROR", data: { error_message: "x" } }),
    ).toEqual({ kind: "cancelled", detail: "x" });
    expect(readSignupEvent(origin, "{broken")).toBeNull();
  });

  it("TC-WA-D-15 the PIN is exactly six digits", () => {
    expect(isSignupPin("123456")).toBe(true);
    expect(isSignupPin("12345")).toBe(false);
    expect(isSignupPin("12345a")).toBe(false);
  });
});
