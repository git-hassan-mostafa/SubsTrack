import {
  hasAuditFilter,
  NO_AUDIT_FILTER,
  toAuditFilter,
} from "@shared/modules/admin/audit/utils/filter";
import { whatsAppChatUrl } from "@shared/core/utils/whatsappLink";
import { signedDigitsOnly } from "@shared/core/utils/inputText";

// TC-AF-* — the Audit Log filter both apps send; TC-WL-* the wa.me link.

describe("audit filter", () => {
  it("TC-AF-01 no pick means no filter, the branch still rides along", () => {
    expect(hasAuditFilter(NO_AUDIT_FILTER)).toBe(false);
    expect(toAuditFilter(NO_AUDIT_FILTER, "b1")).toEqual({
      table: undefined,
      action: undefined,
      actorUserId: undefined,
      from: undefined,
      to: undefined,
      branchFilter: "b1",
    });
  });

  it("TC-AF-02 picked days cover the whole UTC day", () => {
    const choice = { ...NO_AUDIT_FILTER, from: "2026-09-01", to: "2026-09-30" };
    expect(hasAuditFilter(choice)).toBe(true);
    const filter = toAuditFilter(choice, null);
    expect(filter.from).toBe("2026-09-01T00:00:00.000Z");
    expect(filter.to).toBe("2026-09-30T23:59:59.999Z");
  });

  it("TC-AF-03 table, action and staff pass through", () => {
    const filter = toAuditFilter(
      { ...NO_AUDIT_FILTER, table: "charges", action: "void", actor: "u1" },
      null,
    );
    expect(filter).toMatchObject({ table: "charges", action: "void", actorUserId: "u1" });
  });
});

describe("whatsapp link", () => {
  it("TC-WL-01 keeps only the digits of the number", () => {
    expect(whatsAppChatUrl("+961 70-123 456")).toBe("https://wa.me/96170123456");
  });

  it("TC-WL-02 encodes the message and refuses an empty number", () => {
    expect(whatsAppChatUrl("961", "a & b")).toBe("https://wa.me/961?text=a%20%26%20b");
    expect(whatsAppChatUrl(" - ")).toBeNull();
    expect(whatsAppChatUrl(null)).toBeNull();
  });
});

describe("signed digits", () => {
  it("TC-WL-03 a change box keeps one leading minus", () => {
    expect(signedDigitsOnly("-12a")).toBe("-12");
    expect(signedDigitsOnly("1-2")).toBe("12");
    expect(signedDigitsOnly("+5")).toBe("5");
  });
});
