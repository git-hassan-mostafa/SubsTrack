import { defaultNewBranchId } from "@shared/modules/admin/branches/utils/defaultBranch";

// TC-DB-* — which branch a new plan / service / product / user / customer starts on.

describe("defaultNewBranchId", () => {
  const one = [{ id: "b1" }];
  const two = [{ id: "b1" }, { id: "b2" }];

  it("TC-DB-01 a branch-scoped user always gets their own branch", () => {
    expect(defaultNewBranchId({ branchId: "b2" }, two)).toBe("b2");
    expect(defaultNewBranchId({ branchId: "b2" }, one)).toBe("b2");
  });

  it("TC-DB-02 a tenant-wide user of a one-branch tenant gets that branch", () => {
    expect(defaultNewBranchId({ branchId: null }, one)).toBe("b1");
  });

  it("TC-DB-03 a tenant-wide user with 0 or 2+ branches starts on none", () => {
    expect(defaultNewBranchId({ branchId: null }, two)).toBeNull();
    expect(defaultNewBranchId({ branchId: null }, [])).toBeNull();
  });

  it("TC-DB-04 no signed-in user falls back to the branch list alone", () => {
    expect(defaultNewBranchId(null, one)).toBe("b1");
    expect(defaultNewBranchId(null, two)).toBeNull();
  });
});
