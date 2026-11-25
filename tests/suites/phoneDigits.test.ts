import { internationalPhoneDigits } from "@edge/digits";
import { canSendWhatsApp, whatsAppChatUrl } from "@shared/core/utils/whatsappLink";

describe("internationalPhoneDigits", () => {
  it.each([
    ["03123456", "9613123456"],
    ["03 123 456", "9613123456"],
    ["3123456", "9613123456"],
    ["81446801", "96181446801"],
    ["81-446-801", "96181446801"],
    ["+96181446801", "96181446801"],
    ["+961 81 446 801", "96181446801"],
    ["0096181446801", "96181446801"],
    ["96181446801", "96181446801"],
    ["٠٣١٢٣٤٥٦", "9613123456"],
    ["+1 555 123 4567", "15551234567"],
    ["00447911123456", "447911123456"],
  ])("TC-PH-01 %s → %s", (raw, expected) => {
    expect(internationalPhoneDigits(raw)).toBe(expected);
  });

  it.each([null, undefined, "", " - ", "n/a", "0", "00"])("TC-PH-02 %p has no number", (raw) => {
    expect(internationalPhoneDigits(raw)).toBeNull();
  });
});

describe("whatsAppChatUrl with local numbers", () => {
  it("TC-PH-03 a local Lebanese number opens the full international chat", () => {
    expect(whatsAppChatUrl("03 123 456", "hi")).toBe("https://wa.me/9613123456?text=hi");
    expect(canSendWhatsApp("03 123 456")).toBe(true);
    expect(canSendWhatsApp("n/a")).toBe(false);
  });
});
