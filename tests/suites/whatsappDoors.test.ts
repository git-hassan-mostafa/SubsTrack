import type { WhatsAppMessage } from "@shared/core/types";
import {
  isFacebookOrigin,
  isSignupPin,
  readSignupEvent,
} from "@shared/modules/whatsapp/utils/embeddedSignup";
import {
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
import type { MenuItem } from "@shared/shared/lib/menuItem";
import { customer } from "../helpers/factories";

// TC-WA-D-* — the WhatsApp doors both apps draw, and the signup page's trust rules.
const keysOf = <K extends string>(items: MenuItem<K>[]) => items.map((item) => item.key);
const t = (key: string) => key;

const CONNECTED: WhatsAppMenuFacts = {
  isAdmin: true,
  ready: true,
  reminderReady: true,
  optedOutIds: new Set(),
};

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
  it("TC-WA-D-01 a non-admin sees no WhatsApp door", () => {
    expect(whatsAppCustomerItems(customer(), { ...CONNECTED, isAdmin: false })).toEqual([]);
    expect(whatsAppSelectionItems([customer()], { ...CONNECTED, isAdmin: false })).toEqual([]);
  });

  it("TC-WA-D-02 not connected leaves only the wa.me reminder, and only with a phone", () => {
    const offline = { ...CONNECTED, ready: false };
    const items = whatsAppCustomerItems(customer(), offline);
    expect(keysOf(items)).toEqual(["whatsapp_reminder"]);
    expect(items[0]).toMatchObject({ captionKey: "whatsapp.opens_whatsapp" });
    expect(items[0].disabled).toBeFalsy();
    expect(whatsAppCustomerItems(customer({ phoneNumber: null }), offline)).toEqual([]);
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
    expect(items[2].disabled).toBe(false);
  });

  it("TC-WA-D-05 no phone blocks every send and the stop toggle", () => {
    const items = whatsAppCustomerItems(customer({ phoneNumber: null }), CONNECTED);
    expect(items.every((item) => item.disabled)).toBe(true);
    expect(items[0]).toMatchObject({ captionKey: "invoice.no_phone" });
  });

  it("TC-WA-D-06 the reminder waits for Meta's approval; a free message does not", () => {
    const items = whatsAppCustomerItems(customer(), { ...CONNECTED, reminderReady: false });
    expect(items[0]).toMatchObject({ disabled: true, captionKey: "whatsapp.template_pending" });
    expect(items[1].disabled).toBe(false);
  });

  it("TC-WA-D-07 a selection sends only when connected and not empty", () => {
    expect(keysOf(whatsAppSelectionItems([customer()], CONNECTED))).toEqual(["whatsapp_send"]);
    expect(whatsAppSelectionItems([], CONNECTED)).toEqual([]);
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
