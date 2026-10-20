import type {
  ICustomerImportRepository,
  ImportCustomerPayload,
  ImportLinePayload,
  PhoneOwner,
} from "@shared/modules/customer/customer-import/repository/ICustomerImportRepository";

// One server call per group; a chosen group (1-based) can fail, land anyway, or fail the lookup.
class FakeCustomerImportRepository implements ICustomerImportRepository {
  groups: { customers: ImportCustomerPayload[]; lines: ImportLinePayload[] }[] = [];
  landed = new Set<string>();
  failOnGroup: number | null = null;
  landAnyway = false;
  lookupFails = false;
  private calls = 0;

  reset(): void {
    this.groups = [];
    this.landed = new Set();
    this.failOnGroup = null;
    this.landAnyway = false;
    this.lookupFails = false;
    this.calls = 0;
  }

  async findPhoneOwners(): Promise<PhoneOwner[]> {
    return [];
  }

  async importGroup(customers: ImportCustomerPayload[], lines: ImportLinePayload[]): Promise<void> {
    this.calls += 1;
    const failing = this.calls === this.failOnGroup;
    if (!failing || this.landAnyway) {
      this.groups.push({ customers, lines });
      for (const customer of customers) this.landed.add(customer.id);
    }
    if (failing) throw new Error("server said no");
  }

  async findExistingIds(ids: string[]): Promise<Set<string>> {
    if (this.lookupFails) throw new Error("offline");
    return new Set(ids.filter((id) => this.landed.has(id)));
  }
}

export const fakeCustomerImportRepository = new FakeCustomerImportRepository();
