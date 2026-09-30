import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { connectToTestProject } from "./connect.mjs";

const { values: args } = parseArgs({
  options: {
    customers: { type: "string", default: "10000" },
    append: { type: "boolean", default: false },
    "yes-this-is-the-test-project": { type: "boolean", default: false },
  },
});

const CUSTOMER_COUNT = Number(args.customers);
const BATCH = 1000;
const PARALLEL = 4;
const PRICE = 10;
const AREAS = ["Hamra", "Achrafieh", "Verdun", "Dora", "Jounieh", "Saida"];

if (!args["yes-this-is-the-test-project"]) {
  throw new Error(
    "Pass --yes-this-is-the-test-project: this writes thousands of fake rows.",
  );
}
if (!Number.isInteger(CUSTOMER_COUNT) || CUSTOMER_COUNT < 1) {
  throw new Error("--customers must be a whole number above 0.");
}

let state = 42;
function random() {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

function monthsAgo(back) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function billingMonth({ year, month }) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

// How many recent months a line leaves unpaid, and how often it skips others.
function payingHabit() {
  const r = random();
  if (r < 0.6) return { unpaidTail: random() < 0.5 ? 0 : 1, missRate: 0 };
  if (r < 0.8) return { unpaidTail: 1 + Math.floor(random() * 4), missRate: 0 };
  if (r < 0.9) return { unpaidTail: 0, missRate: 0.4 };
  return { unpaidTail: 5 + Math.floor(random() * 8), missRate: 0 };
}

function buildRows(tenantId, userId, branchIds) {
  const rows = {
    customers: [],
    customer_plans: [],
    charges: [],
    collections: [],
    collection_items: [],
    skipped_months: [],
  };
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 1; i <= CUSTOMER_COUNT; i++) {
    const customerId = randomUUID();
    const branchId = branchIds.length ? pick(branchIds) : null;
    rows.customers.push({
      id: customerId,
      tenant_id: tenantId,
      branch_id: branchId,
      name: `Speed Customer ${String(i).padStart(6, "0")}`,
      phone_number: `03${String(Math.floor(random() * 1e7)).padStart(7, "0")}`,
      area: pick(AREAS),
      active: random() < 0.95,
      is_regular: random() < 0.97,
    });

    const paidByYear = new Map();
    const lineCount = random() < 0.1 ? 2 : 1;
    for (let l = 0; l < lineCount; l++) {
      const lineId = randomUUID();
      const startBack = Math.floor(random() * 30);
      const start = monthsAgo(startBack);
      const startDay = 1 + Math.floor(random() * 28);
      rows.customer_plans.push({
        id: lineId,
        tenant_id: tenantId,
        customer_id: customerId,
        start_date: `${billingMonth(start).slice(0, 8)}${String(startDay).padStart(2, "0")}`,
        active: true,
        custom_price: PRICE,
      });

      const habit = payingHabit();
      const skipBack = random() < 0.03 ? Math.floor(random() * startBack) : -1;
      for (let back = startBack; back >= 0; back--) {
        const month = billingMonth(monthsAgo(back));
        if (back === skipBack) {
          rows.skipped_months.push({
            tenant_id: tenantId,
            customer_id: customerId,
            customer_plan_id: lineId,
            billing_month: month,
            skipped: true,
            skipped_by_user_id: userId,
          });
          continue;
        }
        if (back < habit.unpaidTail || random() < habit.missRate) continue;
        const chargeId = randomUUID();
        rows.charges.push({
          id: chargeId,
          tenant_id: tenantId,
          branch_id: branchId,
          customer_id: customerId,
          kind: "month",
          customer_plan_id: lineId,
          billing_month: month,
          duration_months: 1,
          amount: PRICE,
          rate_per_usd_snapshot: 1,
          issued_at: `${month}T10:00:00Z`,
          due_date: month,
          recorded_by_user_id: userId,
        });
        const year = month.slice(0, 4);
        const list = paidByYear.get(year) ?? [];
        list.push({ chargeId, month, amount: random() < 0.05 ? PRICE / 2 : PRICE });
        paidByYear.set(year, list);
      }
    }

    for (const paid of paidByYear.values()) {
      const collectionId = randomUUID();
      const last = paid[paid.length - 1].month;
      rows.collections.push({
        id: collectionId,
        tenant_id: tenantId,
        branch_id: branchId,
        customer_id: customerId,
        amount: paid.reduce((sum, p) => sum + p.amount, 0),
        rate_per_usd_snapshot: 1,
        received_at: `${last.slice(0, 8)}05T10:00:00Z`,
        received_by_user_id: userId,
        held_by_user_id: userId,
        kind: "month",
      });
      for (const p of paid) {
        rows.collection_items.push({
          tenant_id: tenantId,
          collection_id: collectionId,
          charge_id: p.chargeId,
          amount: p.amount,
        });
      }
    }

    if (random() < 0.08) {
      rows.charges.push({
        tenant_id: tenantId,
        branch_id: branchId,
        customer_id: customerId,
        kind: "manual",
        description: "Speed test fee",
        amount: 25,
        rate_per_usd_snapshot: 1,
        due_date: today,
        recorded_by_user_id: userId,
      });
    }
  }
  return rows;
}

async function insertAll(db, table, rows) {
  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    batches.push(rows.slice(i, i + BATCH));
  }
  let done = 0;
  async function worker() {
    for (;;) {
      const batch = batches.shift();
      if (!batch) return;
      const { error } = await db.from(table).insert(batch);
      if (error) throw new Error(`${table}: ${error.message}`);
      done += batch.length;
      process.stdout.write(`\r${table}: ${done}/${rows.length}`);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  process.stdout.write("\n");
}

const { db, url, profile } = await connectToTestProject();
if (profile.branch_id !== null) {
  throw new Error("Sign in as an organization-wide admin of the test organization.");
}
const { count, error: countError } = await db
  .from("customers")
  .select("id", { count: "exact", head: true });
if (countError) throw new Error(countError.message);
if (count > 0 && !args.append) {
  throw new Error(
    `This organization already has ${count} customers. Use an empty test organization, or pass --append.`,
  );
}
const { data: branches, error: branchError } = await db
  .from("branches")
  .select("id")
  .eq("active", true);
if (branchError) throw new Error(branchError.message);

console.log(`Seeding ${CUSTOMER_COUNT} customers into ${url}`);
const rows = buildRows(
  profile.tenant_id,
  profile.id,
  branches.map((b) => b.id),
);
for (const table of Object.keys(rows)) {
  await insertAll(db, table, rows[table]);
}
console.log("Done.");
