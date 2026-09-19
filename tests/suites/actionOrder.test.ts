import { sortActions } from "@/src/shared/lib/actionOrder";

const keysOf = (rows: { key: string }[]) => rows.map((r) => r.key);

describe("action row order", () => {
  it("puts every band in its place whatever order the caller wrote", () => {
    const rows = sortActions([
      { key: "delete", group: "danger" as const },
      { key: "history", group: "history" as const },
      { key: "edit", group: "manage" as const },
      { key: "collect", group: "money" as const },
      { key: "open", group: "open" as const },
      { key: "deactivate", group: "status" as const },
      { key: "invoice", group: "send" as const },
      { key: "record-sale", group: "create" as const },
    ]);
    expect(keysOf(rows)).toEqual([
      "open",
      "collect",
      "record-sale",
      "invoice",
      "edit",
      "history",
      "deactivate",
      "delete",
    ]);
  });

  it("keeps history above the red block and delete at the bottom", () => {
    const rows = sortActions([
      { key: "history", group: "history" as const },
      { key: "write-off-all", group: "danger" as const, destructive: true },
      { key: "delete", group: "danger" as const, destructive: true },
    ]);
    expect(keysOf(rows)).toEqual(["history", "write-off-all", "delete"]);
  });

  it("keeps the caller order inside one band", () => {
    const rows = sortActions([
      { key: "pay", group: "money" as const },
      { key: "pay-whatsapp", group: "money" as const },
      { key: "collect-part", group: "money" as const },
    ]);
    expect(keysOf(rows)).toEqual(["pay", "pay-whatsapp", "collect-part"]);
  });

  it("drops an untagged destructive row to the red block", () => {
    const rows = sortActions([
      { key: "void", destructive: true },
      { key: "history", group: "history" as const },
      { key: "edit" },
    ]);
    expect(keysOf(rows)).toEqual(["edit", "history", "void"]);
  });

  it("leaves an untagged list exactly as written", () => {
    const rows = sortActions([{ key: "view" }, { key: "all" }]);
    expect(keysOf(rows)).toEqual(["view", "all"]);
  });
});
