// The band a row belongs to; the order of bands is the order of every menu.
export type ActionGroup =
  | "open"
  | "money"
  | "create"
  | "send"
  | "manage"
  | "history"
  | "status"
  | "danger";

const GROUP_RANK: Record<ActionGroup, number> = {
  open: 0,
  money: 1,
  create: 2,
  send: 3,
  manage: 4,
  history: 5,
  status: 6,
  danger: 7,
};

export interface GroupedAction {
  group?: ActionGroup;
  destructive?: boolean;
}

// An untagged row sits with the manage rows, or with the red block if destructive.
function rankOf(action: GroupedAction): number {
  if (action.group) return GROUP_RANK[action.group];
  return GROUP_RANK[action.destructive ? "danger" : "manage"];
}

// Stable on purpose — rows in one band keep the order their caller wrote them.
export function sortActions<T extends GroupedAction>(
  actions: readonly T[],
): T[] {
  return actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => rankOf(a.action) - rankOf(b.action) || a.index - b.index)
    .map((entry) => entry.action);
}
