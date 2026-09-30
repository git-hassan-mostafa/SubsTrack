import { parseArgs } from "node:util";
import { connectToTestProject } from "./connect.mjs";

const { values: args } = parseArgs({
  options: { runs: { type: "string", default: "5" } },
});

const RUNS = Number(args.runs);
const TARGET_MS = 1500;
const SCENARIOS = [
  { name: "Active, page 1", tab: "active" },
  { name: "Unpaid", tab: "unpaid" },
  { name: "Overdue", tab: "overdue" },
  { name: "Has debts", tab: "has_debt" },
  { name: "All, page 5", tab: "all", offset: 100 },
  { name: "Search", tab: "all", search: "Customer 0001" },
];

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function timed(run) {
  const started = performance.now();
  const result = await run();
  return { ms: Math.round(performance.now() - started), result };
}

const { db, url } = await connectToTestProject();
console.log(`Measuring ${url}, ${RUNS} runs each\n`);

const facts = await timed(() => db.rpc("customer_status_facts", {}));
if (facts.result.error) throw new Error(facts.result.error.message);
const size = JSON.stringify(facts.result.data).length;
console.log(
  `Facts read alone: ${facts.ms} ms, ${(size / 1e6).toFixed(1)} MB, ` +
    `${facts.result.data.customers.length} customers, ${facts.result.data.lines.length} lines\n`,
);

let worst = 0;
for (const scenario of SCENARIOS) {
  const times = [];
  let total = 0;
  for (let i = 0; i < RUNS; i++) {
    const { ms, result } = await timed(() =>
      db.functions.invoke("customer-status", {
        body: {
          search: scenario.search ?? "",
          tab: scenario.tab,
          branch: null,
          offset: scenario.offset ?? 0,
          limit: 25,
          today: localToday(),
        },
      }),
    );
    if (result.error) throw new Error(`${scenario.name}: ${result.error.message}`);
    times.push(ms);
    total = result.data.total;
  }
  worst = Math.max(worst, median(times));
  console.log(
    `${scenario.name.padEnd(16)} median ${String(median(times)).padStart(5)} ms   ` +
      `max ${String(Math.max(...times)).padStart(5)} ms   ${total} in tab`,
  );
}

console.log(
  `\nSlowest median ${worst} ms — target is under ${TARGET_MS} ms: ${worst < TARGET_MS ? "PASS" : "FAIL"}`,
);
