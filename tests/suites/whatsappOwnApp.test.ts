import type { WhatsAppAccount } from "@shared/core/types";
import {
  nextOwnAppStep,
  numberOptions,
  ownAppInput,
  type OwnAppFields,
} from "@shared/modules/whatsapp/utils/ownAppForm";
import { needsManualWebhook } from "@shared/modules/whatsapp/utils/whatsappView";

// TC-WA-O-* — connecting with the tenant's own Meta app keys.
const KEYS: OwnAppFields = {
  token: "  EAAG-token  ",
  appSecret: " secret ",
  wabaId: "",
  phoneNumberId: null,
  pin: "",
};

const account = (patch: Partial<WhatsAppAccount>): WhatsAppAccount => ({
  id: "a1",
  wabaId: "100",
  phoneNumberId: "200",
  displayPhoneNumber: "+961 70 123 456",
  verifiedName: "Ali Generators",
  isCoexistence: false,
  status: "connected",
  attentionCode: null,
  qualityRating: null,
  messagingLimitTier: null,
  nameStatus: null,
  consentConfirmedAt: null,
  connectedAt: "2026-11-18T00:00:00Z",
  appId: null,
  webhookAuto: false,
  ...patch,
});

describe("ownAppInput", () => {
  it("TC-WA-O-01 sends trimmed keys and no number on the first step", () => {
    expect(ownAppInput(KEYS, "keys", true)).toEqual({
      consent: true,
      token: "EAAG-token",
      appSecret: "secret",
      wabaId: null,
      phoneNumberId: null,
      pin: null,
    });
  });

  it("TC-WA-O-02 refuses without consent or with an empty key", () => {
    expect(ownAppInput(KEYS, "keys", false)).toBeNull();
    expect(ownAppInput({ ...KEYS, token: "   " }, "keys", true)).toBeNull();
    expect(ownAppInput({ ...KEYS, appSecret: "" }, "keys", true)).toBeNull();
  });

  it("TC-WA-O-03 needs a chosen number on the number step", () => {
    expect(ownAppInput(KEYS, "choose_number", true)).toBeNull();
    expect(ownAppInput({ ...KEYS, phoneNumberId: "200" }, "choose_number", true)?.phoneNumberId).toBe("200");
  });

  it("TC-WA-O-04 sends the PIN only on the PIN step and only when it is 6 digits", () => {
    const withNumber = { ...KEYS, phoneNumberId: "200" };
    expect(ownAppInput({ ...withNumber, pin: "12345" }, "pin", true)).toBeNull();
    expect(ownAppInput({ ...withNumber, pin: "123456" }, "pin", true)?.pin).toBe("123456");
    expect(ownAppInput({ ...withNumber, pin: "123456" }, "choose_number", true)?.pin).toBeNull();
  });

  it("TC-WA-O-05 a typed number is ignored on the keys step", () => {
    expect(ownAppInput({ ...KEYS, phoneNumberId: "200" }, "keys", true)?.phoneNumberId).toBeNull();
  });

  it("TC-WA-O-09 the WABA step needs a typed digits-only id and sends it with no number", () => {
    expect(ownAppInput(KEYS, "waba", true)).toBeNull();
    expect(ownAppInput({ ...KEYS, wabaId: "12a4" }, "waba", true)).toBeNull();
    const input = ownAppInput({ ...KEYS, wabaId: " 1234567 " }, "waba", true);
    expect(input?.wabaId).toBe("1234567");
    expect(input?.phoneNumberId).toBeNull();
  });

  it("TC-WA-O-10 a typed WABA id is re-sent on later steps and ignored on the keys step", () => {
    const typed = { ...KEYS, wabaId: "1234567", phoneNumberId: "200" };
    expect(ownAppInput(typed, "choose_number", true)?.wabaId).toBe("1234567");
    expect(ownAppInput({ ...typed, pin: "123456" }, "pin", true)?.wabaId).toBe("1234567");
    expect(ownAppInput(typed, "keys", true)?.wabaId).toBeNull();
    expect(ownAppInput({ ...KEYS, phoneNumberId: "200" }, "choose_number", true)?.wabaId).toBeNull();
  });
});

describe("nextOwnAppStep", () => {
  it("TC-WA-O-06 maps each server answer to the next step", () => {
    expect(nextOwnAppStep({ status: "needs_waba" })).toBe("waba");
    expect(nextOwnAppStep({ status: "choose_number", numbers: [] })).toBe("choose_number");
    expect(nextOwnAppStep({ status: "needs_pin", phoneNumberId: "200" })).toBe("pin");
    expect(nextOwnAppStep({ status: "connected", displayPhoneNumber: null, verifiedName: null })).toBe("done");
  });
});

describe("numberOptions", () => {
  it("TC-WA-O-07 shows the real number with the business name, the id when Meta has no number", () => {
    expect(
      numberOptions([
        { phoneNumberId: "200", displayPhoneNumber: "+961 70 123 456", verifiedName: "Ali" },
        { phoneNumberId: "201", displayPhoneNumber: null, verifiedName: null },
      ]),
    ).toEqual([
      { value: "200", label: "+961 70 123 456", sublabel: "Ali" },
      { value: "201", label: "201", sublabel: undefined },
    ]);
  });
});

describe("needsManualWebhook", () => {
  it("TC-WA-O-08 only an own-app account whose automatic webhook failed asks for manual setup", () => {
    expect(needsManualWebhook(account({ appId: null, webhookAuto: false }))).toBe(false);
    expect(needsManualWebhook(account({ appId: "999", webhookAuto: true }))).toBe(false);
    expect(needsManualWebhook(account({ appId: "999", webhookAuto: false }))).toBe(true);
  });
});
