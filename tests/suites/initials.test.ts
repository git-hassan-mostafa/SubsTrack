import { initialsOf } from "@shared/core/utils/initials";

describe("initialsOf", () => {
  it("TC-IN-01 a Latin name gives the first letters of its first and last word", () => {
    expect(initialsOf("ali khalil")).toBe("AK");
    expect(initialsOf("Rana Maria Haddad")).toBe("RH");
  });

  it("TC-IN-02 a one-word Latin name gives one letter", () => {
    expect(initialsOf("Mahmoud")).toBe("M");
  });

  it("TC-IN-03 an Arabic name gives ONE letter, so two letters never join into a word", () => {
    expect(initialsOf("علي مصطفى")).toBe("ع");
  });

  it("TC-IN-04 a leading Arabic article is skipped", () => {
    expect(initialsOf("الحسن علي")).toBe("ح");
    expect(initialsOf("ال")).toBe("ا");
  });

  it("TC-IN-05 an empty or blank name gives nothing", () => {
    expect(initialsOf("")).toBe("");
    expect(initialsOf("   ")).toBe("");
  });

  it("TC-IN-06 an emoji is never split in half", () => {
    expect(initialsOf("😀 Shop")).toBe("😀S");
  });
});
