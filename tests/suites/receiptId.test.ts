import {
  RECEIPT_ID_LENGTH,
  isReceiptIdTerm,
  receiptId,
  receiptIdTerm,
  saleTitle,
} from "@/src/core/utils/receiptId";
import { sanitizeSearchTerm } from "@/src/core/utils/searchTerm";

// A sale has no sequence column and must not grow one — an offline device raises
// one with no server round trip. The UUID tail IS the sale's name everywhere a
// bill is shown, and Postgres derives the same number in `receipt_id(sales)`, so
// a second definition would silently stop finding what a card prints.

const UUID = "3f2a9c41-8b7d-4e55-9a10-77c0de9ab123";

describe("TC-RI-01..06 — the receipt number is the tail of the id", () => {
  it("TC-RI-01 takes the last six characters, uppercased", () => {
    expect(receiptId(UUID)).toBe("9AB123");
  });

  it("TC-RI-02 is exactly RECEIPT_ID_LENGTH long", () => {
    expect(receiptId(UUID)).toHaveLength(RECEIPT_ID_LENGTH);
  });

  it("TC-RI-03 an id shorter than six characters is taken whole", () => {
    expect(receiptId("abc")).toBe("ABC");
  });

  it("TC-RI-04 two ids differing only in their tail read differently", () => {
    expect(receiptId("aaaaaaaa-0000-0000-0000-0000000000ff")).not.toBe(
      receiptId(UUID),
    );
  });

  it("TC-RI-05 two ids sharing a tail read the SAME — the tail is the whole name", () => {
    expect(receiptId("11111111-0000-0000-0000-0000009ab123")).toBe(
      receiptId(UUID),
    );
  });

  it("TC-RI-06 is stable — the same id always gives the same number", () => {
    expect(receiptId(UUID)).toBe(receiptId(UUID));
  });
});

describe("TC-RI-07..09 — how a sale is titled", () => {
  it("TC-RI-07 leads with the receipt number, the items a subtitle", () => {
    expect(saleTitle(UUID, "2 x Router")).toBe("#9AB123 · 2 x Router");
  });

  it("TC-RI-08 an itemless sale still carries its number", () => {
    expect(saleTitle(UUID, "No items")).toBe("#9AB123 · No items");
  });

  it("TC-RI-09 the title always starts with the hash marker", () => {
    expect(saleTitle(UUID, "x").startsWith("#")).toBe(true);
  });
});

describe("TC-RI-10..14 — the bare characters a receipt search matches", () => {
  it("TC-RI-10 drops a leading hash the user typed", () => {
    expect(receiptIdTerm("#9AB123")).toBe("9ab123");
  });

  it("TC-RI-11 lowercases, because the stored id is lowercase hex", () => {
    expect(receiptIdTerm("9AB123")).toBe("9ab123");
  });

  it("TC-RI-12 trims surrounding blanks", () => {
    expect(receiptIdTerm("  9ab123  ")).toBe("9ab123");
  });

  it("TC-RI-13 drops only the FIRST hash", () => {
    expect(receiptIdTerm("##9ab123")).toBe("#9ab123");
  });

  it("TC-RI-14 an empty term stays empty", () => {
    expect(receiptIdTerm("   ")).toBe("");
  });
});

describe("TC-RI-15..22 — is this a receipt number or an ordinary search?", () => {
  it("TC-RI-15 six hex characters read as a receipt number", () => {
    expect(isReceiptIdTerm("9ab123")).toBe(true);
  });

  it("TC-RI-16 a hash-prefixed number reads as one too", () => {
    expect(isReceiptIdTerm("#9AB123")).toBe(true);
  });

  it("TC-RI-17 a SHORT hex fragment still reads as one", () => {
    expect(isReceiptIdTerm("9ab")).toBe(true);
  });

  it("TC-RI-18 a non-hex letter makes it an ordinary name search", () => {
    expect(isReceiptIdTerm("router")).toBe(false);
  });

  it("TC-RI-19 longer than a receipt number cannot be one", () => {
    expect(isReceiptIdTerm("9ab1234")).toBe(false);
  });

  it("TC-RI-20 an empty term is not a receipt number", () => {
    expect(isReceiptIdTerm("")).toBe(false);
  });

  it("TC-RI-21 a plain digit string is hex, so it IS a receipt term", () => {
    expect(isReceiptIdTerm("123")).toBe(true);
  });

  it("TC-RI-22 a customer name that happens to be hex-ish but long is not one", () => {
    expect(isReceiptIdTerm("decade1")).toBe(false);
  });
});

describe("TC-RI-23..28 — a typed term is made safe for a PostgREST filter", () => {
  it("TC-RI-23 strips the wildcard that would break the logic tree", () => {
    expect(sanitizeSearchTerm("100%")).toBe("100");
  });

  it("TC-RI-24 strips the comma that ends an or() clause", () => {
    expect(sanitizeSearchTerm("Smith, John")).toBe("Smith John");
  });

  it("TC-RI-25 strips the brackets that group one", () => {
    expect(sanitizeSearchTerm("Acme (Beirut)")).toBe("Acme Beirut");
  });

  it("TC-RI-26 strips the star wildcard and the backslash", () => {
    expect(sanitizeSearchTerm("a*b\\c")).toBe("abc");
  });

  it("TC-RI-27 trims, and turns null or undefined into an empty term", () => {
    expect(sanitizeSearchTerm("  hi  ")).toBe("hi");
    expect(sanitizeSearchTerm(null)).toBe("");
    expect(sanitizeSearchTerm(undefined)).toBe("");
  });

  it("TC-RI-28 leaves an ordinary name untouched", () => {
    expect(sanitizeSearchTerm("Ali Hassan")).toBe("Ali Hassan");
  });
});
