export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value == null) continue;
    if (name.startsWith("on") && typeof value === "function") {
      el.addEventListener(name.slice(2).toLowerCase(), value);
    } else if (name === "class") {
      el.className = value;
    } else if (name in el) {
      el[name] = value;
    } else if (value !== false) {
      el.setAttribute(name, value === true ? "" : String(value));
    }
  }
  el.append(...children.flat(Infinity).filter((child) => child != null && child !== false));
  return el;
}

function sourceOf(stores) {
  const list = [stores].flat();
  return {
    read: () => list.map((store) => store.getState()),
    subscribe(listener) {
      const stops = list.map((store) => store.subscribe(listener));
      return () => stops.forEach((stop) => stop());
    },
  };
}

// Runs `effect` only when a selected value changes, so typed text survives.
export function watch(stores, select, effect) {
  const source = sourceOf(stores);
  let last = null;
  const update = () => {
    const next = select(...source.read());
    if (last && next.every((value, i) => Object.is(value, last[i]))) return;
    last = next;
    effect(...next);
  };
  update();
  return source.subscribe(update);
}

export function bind(stores, container, select, render) {
  return watch(stores, select, (...values) => {
    container.replaceChildren(...[render(...values)].flat().filter(Boolean));
  });
}

export function button(label, variant, onClick, type = "button") {
  return h("button", { type, class: `btn ${variant}`, onClick }, label);
}
