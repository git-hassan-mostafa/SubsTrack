import {
  isLongEnoughPassword,
  isValidUsername,
  roleLabelKey,
  rolesForFilter,
} from "@shared/modules/admin/users/utils/userRules";

// TC-UR-* — the username / password rules shared by the staff forms and signup.

describe("user rules", () => {
  it("TC-UR-01 a username is letters, digits, dots and underscores, any case", () => {
    expect(isValidUsername("ali.k_2")).toBe(true);
    expect(isValidUsername("Ali")).toBe(true);
    expect(isValidUsername(" ali ")).toBe(true);
    expect(isValidUsername("ali k")).toBe(false);
    expect(isValidUsername("ali-k")).toBe(false);
    expect(isValidUsername("")).toBe(false);
  });

  it("TC-UR-02 a password needs 8 characters", () => {
    expect(isLongEnoughPassword("1234567")).toBe(false);
    expect(isLongEnoughPassword("12345678")).toBe(true);
  });

  it("TC-UR-03 the Admins filter includes the owner", () => {
    expect(rolesForFilter("all")).toBeNull();
    expect(rolesForFilter("admin")).toEqual(["admin", "superadmin"]);
    expect(rolesForFilter("user")).toEqual(["user"]);
  });

  it("TC-UR-04 the role pill reads Staff for a plain user", () => {
    expect(roleLabelKey("user")).toBe("users.staff");
    expect(roleLabelKey("admin")).toBe("users.admin");
    expect(roleLabelKey("superadmin")).toBe("users.super");
  });
});
