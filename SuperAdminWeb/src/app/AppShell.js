import { OptionsPage } from "../modules/options/ui/OptionsPage.js";
import { endSession } from "../modules/session/store/sessionStore.js";
import { TenantsPage } from "../modules/tenants/ui/TenantsPage.js";
import { button, h } from "../shared/ui/dom.js";

const TABS = [
  { id: "tenants", label: "Tenants", page: TenantsPage },
  { id: "options", label: "Options", page: OptionsPage },
];

function initialTab() {
  const id = location.hash.slice(1);
  return TABS.some((tab) => tab.id === id) ? id : TABS[0].id;
}

export function AppShell() {
  const tabBar = h("nav", { class: "tabs" });
  const main = h("main", { class: "main" });
  let page = null;

  function show(tabId) {
    page?.dispose();
    const tab = TABS.find((t) => t.id === tabId);
    page = tab.page();
    main.replaceChildren(page.element);
    tabBar.replaceChildren(
      ...TABS.map((t) =>
        h(
          "button",
          {
            type: "button",
            class: t.id === tabId ? "tab tab-active" : "tab",
            "aria-current": t.id === tabId ? "page" : null,
            onClick: () => show(t.id),
          },
          t.label,
        ),
      ),
    );
    location.replace(`#${tabId}`);
  }

  const element = h(
    "div",
    { class: "shell" },
    h(
      "header",
      { class: "topbar" },
      h("span", { class: "brand" }, "Sijil admin"),
      tabBar,
      button("Forget key", "btn-ghost", () => endSession()),
    ),
    main,
  );
  show(initialTab());
  return { element, dispose: () => page?.dispose() };
}
