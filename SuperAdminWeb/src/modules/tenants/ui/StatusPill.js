import { h } from "../../../shared/ui/dom.js";

export function StatusPill(active) {
  return h("span", { class: active ? "pill pill-ok" : "pill pill-bad" }, active ? "Active" : "Inactive");
}
