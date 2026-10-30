import { h } from "./dom.js";

// Each cell carries its column label, so phone CSS can show a row as a card.
export function DataTable(columns, rows, onRowClick) {
  const row = (item) =>
    h(
      "tr",
      { class: "row-link", onClick: () => onRowClick(item) },
      columns.map((column) =>
        h("td", { class: column.class, "data-label": column.label || null }, column.render(item)),
      ),
    );
  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "table" },
      h("thead", {}, h("tr", {}, columns.map((column) => h("th", {}, column.label)))),
      h("tbody", {}, rows.map(row)),
    ),
  );
}
