import { currentScriptText, onLanguageChange } from "./i18n.js";

const FIXED_FEE = 900000;
const KWH_PRICE = 36000;
const USED_KWH = [145, 165, 135, 115, 155, 180];
const MAY = 4;
const JUNE = 5;
const JULY = 6;
const AUGUST = 7;
const MONTHS = Array.from({ length: 12 }, (_, month) => month);

function billOf(month) {
  return FIXED_FEE + USED_KWH[month] * KWH_PRICE;
}

function money(amount, text) {
  return `${amount.toLocaleString("en-US")} ${text.currency}`;
}

function startState() {
  return { juneRead: false, augustSkipped: false, paid: new Set([0, 1, 2, 3]), event: { kind: "intro" } };
}

// Same order as the app's month grid: money first, then a skip, then waiting / future.
function statusOf(month, state) {
  if (state.paid.has(month)) return "paid";
  if (month === AUGUST && state.augustSkipped) return "skipped";
  if (month <= MAY || (month === JUNE && state.juneRead)) return "unpaid";
  if (month <= JULY) return "waiting";
  return "future";
}

function owedMonths(state) {
  return MONTHS.filter((month) => statusOf(month, state) === "unpaid");
}

function cellNote(month, status, text) {
  if (status === "paid" || status === "unpaid") return billOf(month).toLocaleString("en-US");
  if (status === "waiting") return text.noReading;
  if (status === "skipped") return text.nothingOwed;
  return "";
}

function monthCard(month, state, text) {
  const status = statusOf(month, state);
  const card = document.createElement("div");
  card.className = month === JULY ? "month-card current" : "month-card";
  if (month === JULY) {
    const current = document.createElement("span");
    current.className = "month-current";
    current.textContent = text.thisMonth;
    card.append(current);
  }
  const name = document.createElement("div");
  name.className = "month-name";
  name.textContent = text.months[month];
  const badge = document.createElement("div");
  badge.className = `month-badge ${status}`;
  badge.textContent = text.status[status];
  const fee = document.createElement("div");
  fee.className = "month-fee";
  fee.textContent = cellNote(month, status, text);
  card.append(name, badge, fee);
  return card;
}

function explanation(event, text) {
  if (event.kind === "reading") return { title: text.readingTitle, desc: text.readingText };
  if (event.kind === "skip") return { title: text.skipTitle, desc: text.skipText };
  if (event.kind === "collect") {
    const total = event.months.reduce((sum, month) => sum + billOf(month), 0);
    const lines = event.months.map((month) => text.collectLine(text.monthsLong[month], money(billOf(month), text)));
    return { title: text.collectTitle, desc: `${lines.join(" ")} ${text.collectTotal(money(total, text))}` };
  }
  return { title: text.introTitle, desc: text.introText };
}

function receiptText(months, text) {
  const receipt = text.receipt;
  const total = months.reduce((sum, month) => sum + billOf(month), 0);
  return [
    receipt.title,
    `${receipt.customer}: ${receipt.customerName}`,
    `${receipt.amount}: ${money(total, text)}`,
    `${receipt.date}: ${receipt.dateValue}`,
    `${receipt.pays}:`,
    ...months.map((month) => `• ${text.monthsLong[month]} 2026`),
    receipt.thanks,
  ].join("\n");
}

function renderReceipt(element, event, text) {
  element.replaceChildren();
  element.hidden = event.kind !== "collect";
  if (element.hidden) return;
  const org = document.createElement("strong");
  org.textContent = text.receipt.org;
  element.append(org, document.createTextNode(`\n${receiptText(event.months, text)}`));
}

export function initSimulator() {
  const grid = document.getElementById("simulator-grid");
  if (!grid) return;
  const title = document.getElementById("sim-exp-title");
  const desc = document.getElementById("sim-exp-desc");
  const receipt = document.getElementById("sim-receipt");
  const buttons = {
    reading: document.getElementById("sim-btn-reading"),
    collect: document.getElementById("sim-btn-collect"),
    skip: document.getElementById("sim-btn-skip"),
    reset: document.getElementById("sim-btn-reset"),
  };
  let state = startState();

  const render = () => {
    const text = currentScriptText();
    grid.replaceChildren(...MONTHS.map((month) => monthCard(month, state, text)));
    const shown = explanation(state.event, text);
    title.textContent = shown.title;
    desc.textContent = shown.desc;
    renderReceipt(receipt, state.event, text);
    buttons.reading.disabled = state.juneRead;
    buttons.collect.disabled = owedMonths(state).length === 0;
    buttons.skip.disabled = state.augustSkipped;
  };

  buttons.reading.addEventListener("click", () => {
    state = { ...state, juneRead: true, event: { kind: "reading" } };
    render();
  });

  buttons.collect.addEventListener("click", () => {
    const months = owedMonths(state);
    state = { ...state, paid: new Set([...state.paid, ...months]), event: { kind: "collect", months } };
    render();
  });

  buttons.skip.addEventListener("click", () => {
    state = { ...state, augustSkipped: true, event: { kind: "skip" } };
    render();
  });

  buttons.reset.addEventListener("click", () => {
    state = startState();
    render();
  });

  render();
  onLanguageChange(render);
}
