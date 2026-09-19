import {
  canEditUser,
  canManageUser,
  type UserActor,
} from "@/src/modules/admin/users/utils/userPermissions";

// TC-UP-* — who may edit or deactivate whom, once every branch can SEE the
// tenant-wide admins. Reading a colleague is not permission to write them.

describe("canEditUser", () => {
  const owner: UserActor = { id: "u1", role: "superadmin", branchId: null };
  const tenantAdmin: UserActor = { id: "u2", role: "admin", branchId: null };
  const beirutAdmin: UserActor = { id: "u3", role: "admin", branchId: "b1" };
  const beirutStaff: UserActor = { id: "u4", role: "user", branchId: "b1" };
  const tripoliStaff: UserActor = { id: "u5", role: "user", branchId: "b2" };

  it("TC-UP-01 a tenant-wide viewer writes every row in the tenant", () => {
    expect(canEditUser(tenantAdmin, beirutStaff)).toBe(true);
    expect(canEditUser(tenantAdmin, tripoliStaff)).toBe(true);
    expect(canEditUser(tenantAdmin, owner)).toBe(true);
  });

  it("TC-UP-02 a branch viewer writes only its own branch", () => {
    expect(canEditUser(beirutAdmin, beirutStaff)).toBe(true);
    expect(canEditUser(beirutAdmin, tripoliStaff)).toBe(false);
  });

  it("TC-UP-03 a branch viewer never writes an unassigned row it can now read", () => {
    expect(canEditUser(beirutAdmin, tenantAdmin)).toBe(false);
    expect(canEditUser(beirutAdmin, owner)).toBe(false);
  });

  it("TC-UP-04 a single-branch-less tenant leaves everyone writable", () => {
    expect(
      canEditUser(tenantAdmin, { id: "u6", role: "user", branchId: null }),
    ).toBe(true);
  });
});

describe("canManageUser", () => {
  const owner: UserActor = { id: "u1", role: "superadmin", branchId: null };
  const tenantAdmin: UserActor = { id: "u2", role: "admin", branchId: null };
  const beirutAdmin: UserActor = { id: "u3", role: "admin", branchId: "b1" };
  const beirutStaff: UserActor = { id: "u4", role: "user", branchId: "b1" };
  const looseStaff: UserActor = { id: "u5", role: "user", branchId: null };

  it("TC-UP-10 nobody deactivates their own account", () => {
    expect(canManageUser(owner, owner)).toBe(false);
    expect(canManageUser(beirutAdmin, beirutAdmin)).toBe(false);
  });

  it("TC-UP-11 the owner manages anyone else", () => {
    expect(canManageUser(owner, tenantAdmin)).toBe(true);
    expect(canManageUser(owner, beirutStaff)).toBe(true);
  });

  it("TC-UP-12 an admin manages staff only, never another admin", () => {
    expect(canManageUser(beirutAdmin, beirutStaff)).toBe(true);
    expect(canManageUser(tenantAdmin, beirutAdmin)).toBe(false);
    expect(canManageUser(beirutAdmin, owner)).toBe(false);
  });

  it("TC-UP-13 staff manage nobody", () => {
    expect(canManageUser(beirutStaff, looseStaff)).toBe(false);
  });

  it("TC-UP-14 outranking an unassigned staff row is not enough to write it", () => {
    expect(canManageUser(beirutAdmin, looseStaff)).toBe(false);
    expect(canManageUser(tenantAdmin, looseStaff)).toBe(true);
  });
});
