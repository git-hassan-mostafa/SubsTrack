import type { AppUser, Currency, Plan, Product, Service } from "@shared/core/types";
import {
  canSaveCurrency,
  currencyDraftOf,
  currencyInput,
} from "@shared/modules/admin/currencies/utils/currencyForm";
import {
  canSavePlan,
  MAX_PLAN_DURATION,
  planDraftOf,
  planInput,
  withPlanDuration,
} from "@shared/modules/admin/plans/utils/planForm";
import {
  canSaveProduct,
  newProductInput,
  productDraftOf,
  productInput,
} from "@shared/modules/admin/products/utils/productForm";
import {
  canSaveService,
  serviceDraftOf,
  serviceInput,
} from "@shared/modules/admin/service-catalog/utils/serviceForm";
import {
  asksPassword,
  canSaveUser,
  isBranchMissingForStaff,
  isPasswordMismatch,
  isRoleLocked,
  pickableRoles,
  seededStaffBranchId,
  userCreateInput,
  userDraftOf,
  userUpdateInput,
  withChangePassword,
  type UserDraft,
} from "@shared/modules/admin/users/utils/userForm";
import { LBP, plan } from "../helpers/factories";

// TC-AF-* — the admin forms both apps run: seed, can-save and what reaches the service.

function appUser(over: Partial<AppUser> = {}): AppUser {
  return {
    id: "u-2",
    username: "sara",
    fullName: "Sara",
    phoneNumber: null,
    role: "user",
    branchId: "b-1",
    active: true,
    ...over,
  } as AppUser;
}

function userDraft(over: Partial<UserDraft> = {}): UserDraft {
  return {
    ...userDraftOf(null, "b-1"),
    username: "ali",
    fullName: "Ali",
    password: "12345678",
    confirmPassword: "12345678",
    ...over,
  };
}

describe("currency form", () => {
  it("TC-AF-01 a new currency starts empty with two decimals", () => {
    expect(currencyDraftOf(null)).toEqual({
      code: "",
      name: "",
      symbol: "",
      rateText: "",
      decimalsText: "2",
    });
  });

  it("TC-AF-02 an edit seeds every field from the currency", () => {
    const draft = currencyDraftOf(LBP as Currency);
    expect(draft).toMatchObject({ code: "LBP", rateText: "90000", decimalsText: "0" });
  });

  it("TC-AF-03 code, name, rate and decimals are required; symbol is not", () => {
    const full = { code: "EUR", name: "Euro", symbol: "", rateText: "0.9", decimalsText: "2" };
    expect(canSaveCurrency(full)).toBe(true);
    expect(canSaveCurrency({ ...full, code: "  " })).toBe(false);
    expect(canSaveCurrency({ ...full, rateText: "" })).toBe(false);
    expect(canSaveCurrency({ ...full, decimalsText: "" })).toBe(false);
  });

  it("TC-AF-04 the input parses the rate and drops a blank symbol", () => {
    const input = currencyInput({ code: "EUR", name: "Euro", symbol: " ", rateText: "0.92", decimalsText: "2" });
    expect(input).toEqual({ code: "EUR", name: "Euro", symbol: null, ratePerUsd: 0.92, decimals: 2 });
  });
});

describe("plan form", () => {
  it("TC-AF-05 a new plan takes the branch it is given; an edit keeps its own", () => {
    expect(planDraftOf(null, "b-1").branchId).toBe("b-1");
    expect(planDraftOf(plan({ branchId: null }) as Plan, "b-1").branchId).toBeNull();
  });

  it("TC-AF-06 a multi-month plan can never be custom-priced", () => {
    const custom = { ...planDraftOf(null, null), isCustomPrice: true };
    expect(withPlanDuration(custom, 3)).toMatchObject({ durationMonths: 3, isCustomPrice: false });
    expect(withPlanDuration(custom, 1).isCustomPrice).toBe(true);
  });

  it("TC-AF-07 the duration stays between 1 and the maximum", () => {
    const draft = planDraftOf(null, null);
    expect(withPlanDuration(draft, 0).durationMonths).toBe(1);
    expect(withPlanDuration(draft, MAX_PLAN_DURATION + 5).durationMonths).toBe(MAX_PLAN_DURATION);
  });

  it("TC-AF-08 a fixed plan needs a price above zero; a custom one needs none", () => {
    const draft = { ...planDraftOf(null, null), name: "Fiber" };
    expect(canSavePlan({ ...draft, price: null })).toBe(false);
    expect(canSavePlan({ ...draft, price: 0 })).toBe(false);
    expect(canSavePlan({ ...draft, price: 25 })).toBe(true);
    expect(canSavePlan({ ...draft, isCustomPrice: true })).toBe(true);
    expect(canSavePlan({ ...draft, name: " ", price: 25 })).toBe(false);
  });

  it("TC-AF-09 a custom-priced plan saves with no price and no currency", () => {
    const draft = { ...planDraftOf(null, null), name: "X", isCustomPrice: true, price: 9, currencyId: "c" };
    expect(planInput(draft)).toMatchObject({ isCustomPrice: true, price: null, currencyId: null });
  });
});

describe("service and product forms", () => {
  it("TC-AF-10 a catalog item needs a name and a price above zero", () => {
    const draft = { ...serviceDraftOf(null, null), name: "Repair" };
    expect(canSaveService({ ...draft, price: null })).toBe(false);
    expect(canSaveService({ ...draft, price: 0 })).toBe(false);
    expect(canSaveService({ ...draft, price: 5 })).toBe(true);
    expect(canSaveProduct({ ...productDraftOf(null, null), name: "Router", price: 5 })).toBe(true);
  });

  it("TC-AF-11 a blank description saves as null", () => {
    const service = { name: "Repair", description: "  ", price: 5, currencyId: null, branchId: null } as Service;
    expect(serviceInput(serviceDraftOf(service, null)).description).toBeNull();
  });

  it("TC-AF-12 only a new product carries its typed opening stock", () => {
    const draft = { ...productDraftOf(null, null), name: "Cable", price: 2, initialStock: "7" };
    expect(newProductInput(draft).initialStock).toBe(7);
    expect(newProductInput({ ...draft, initialStock: "" }).initialStock).toBe(0);
    expect(productInput(draft)).not.toHaveProperty("initialStock");
  });

  it("TC-AF-13 an edited product keeps its cost price and cost currency", () => {
    const product = {
      name: "Cable",
      description: null,
      price: 2,
      currencyId: null,
      costPrice: 1,
      costCurrencyId: "cur-lbp",
      branchId: "b-1",
    } as Product;
    expect(productInput(productDraftOf(product, null))).toMatchObject({
      costPrice: 1,
      costCurrencyId: "cur-lbp",
      branchId: "b-1",
    });
  });
});

describe("user form", () => {
  it("TC-AF-14 a new user always asks a password; an edit only when ticked", () => {
    expect(asksPassword(userDraft(), false)).toBe(true);
    expect(asksPassword(userDraft(), true)).toBe(false);
    expect(asksPassword(withChangePassword(userDraft(), true), true)).toBe(true);
  });

  it("TC-AF-15 ticking change-password clears both password boxes", () => {
    expect(withChangePassword(userDraft(), true)).toMatchObject({ password: "", confirmPassword: "" });
  });

  it("TC-AF-16 the mismatch shows only once the password is long enough and a confirm is typed", () => {
    expect(isPasswordMismatch(userDraft({ password: "123", confirmPassword: "4" }), false)).toBe(false);
    expect(isPasswordMismatch(userDraft({ confirmPassword: "" }), false)).toBe(false);
    expect(isPasswordMismatch(userDraft({ confirmPassword: "1234567x" }), false)).toBe(true);
  });

  it("TC-AF-17 staff must belong to a branch once branches exist; admins need not", () => {
    expect(isBranchMissingForStaff(userDraft({ branchId: null }), 2)).toBe(true);
    expect(isBranchMissingForStaff(userDraft({ branchId: null }), 0)).toBe(false);
    expect(isBranchMissingForStaff(userDraft({ branchId: null, role: "admin" }), 2)).toBe(false);
    expect(canSaveUser(userDraft({ branchId: null }), false, 2)).toBe(false);
  });

  it("TC-AF-18 save needs a valid username, a name and matching passwords", () => {
    expect(canSaveUser(userDraft(), false, 1)).toBe(true);
    expect(canSaveUser(userDraft({ username: "ali k" }), false, 1)).toBe(false);
    expect(canSaveUser(userDraft({ fullName: " " }), false, 1)).toBe(false);
    expect(canSaveUser(userDraft({ confirmPassword: "x" }), false, 1)).toBe(false);
    expect(canSaveUser(userDraft({ password: "", confirmPassword: "" }), true, 1)).toBe(true);
  });

  it("TC-AF-19 the owner keeps the owner role and cannot change it", () => {
    const owner = userDraftOf(appUser({ role: "superadmin" }), null);
    expect(pickableRoles(owner)).toEqual(["superadmin"]);
    expect(pickableRoles(userDraft())).toEqual(["user", "admin"]);
    expect(isRoleLocked(owner, appUser({ role: "superadmin" }), "someone-else")).toBe(true);
  });

  it("TC-AF-20 nobody can change their own role", () => {
    const me = appUser({ id: "me", role: "admin" });
    expect(isRoleLocked(userDraftOf(me, null), me, "me")).toBe(true);
    expect(isRoleLocked(userDraftOf(me, null), me, "other")).toBe(false);
  });

  it("TC-AF-21 with one active branch, new staff land in it", () => {
    const branches = [{ id: "b-9" }];
    expect(seededStaffBranchId(userDraft({ branchId: null }), false, branches)).toBe("b-9");
    expect(seededStaffBranchId(userDraft({ branchId: null }), true, branches)).toBeNull();
    expect(seededStaffBranchId(userDraft({ branchId: null, role: "admin" }), false, branches)).toBeNull();
    expect(seededStaffBranchId(userDraft({ branchId: null }), false, [...branches, { id: "b-2" }])).toBeNull();
  });

  it("TC-AF-22 a new account is staff or admin; an edit sends the new password only when asked", () => {
    expect(userCreateInput(userDraft({ role: "superadmin" })).role).toBe("admin");
    expect(userCreateInput(userDraft({ phoneNumber: "" })).phone).toBeNull();
    expect(userUpdateInput(userDraft()).newPassword).toBeUndefined();
    expect(userUpdateInput(userDraft({ changePassword: true })).newPassword).toBe("12345678");
  });
});
