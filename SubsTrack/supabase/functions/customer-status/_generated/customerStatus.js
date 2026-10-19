//#region ../Shared/src/core/constants/index.ts
var MONTHS = [
	"jan",
	"feb",
	"mar",
	"apr",
	"may",
	"jun",
	"jul",
	"aug",
	"sep",
	"oct",
	"nov",
	"dec"
];
var BRANCH_FILTER_UNASSIGNED = "unassigned";
//#endregion
//#region ../Shared/src/core/utils/date.ts
var BARE_DAY = /^\d{4}-\d{2}-\d{2}$/;
function toBillingMonth(year, month) {
	return `${year}-${String(month).padStart(2, "0")}-01`;
}
function shiftBillingMonth(billingMonth, by) {
	const [year, month] = billingMonth.split("-").map(Number);
	const day = new Date(year, month - 1 + by, 1);
	return toBillingMonth(day.getFullYear(), day.getMonth() + 1);
}
var pinnedToday = null;
function currentDate() {
	return pinnedToday ? new Date(pinnedToday) : new Date();
}
function onCalendarDay(day, rule) {
	const [year, month, date] = day.split("-").map(Number);
	const previous = pinnedToday;
	pinnedToday = new Date(year, month - 1, date, 12, 0, 0);
	try {
		return rule();
	} finally {
		pinnedToday = previous;
	}
}
function getCurrentYearMonth() {
	const now = currentDate();
	return {
		year: now.getFullYear(),
		month: now.getMonth() + 1
	};
}
function isValidDateString(s) {
	return BARE_DAY.test(s) && !isNaN(Date.parse(s));
}
//#endregion
//#region ../Shared/src/core/utils/searchTerm.ts
function sanitizeSearchTerm(term) {
	return (term ?? "").trim().replace(/[,()%*\\]/g, "");
}
//#endregion
//#region ../Shared/src/modules/admin/tenant-settings/utils/constants.ts
var DEFAULT_UNPAID_START_RULE = "month_start";
var TENANT_SETTING_KEYS = {
	unpaidStartRule: "UnpaidStartRule",
	displayCurrencyId: "DisplayCurrencyId",
	whatsAppLanguage: "WhatsAppLanguage"
};
//#endregion
//#region ../Shared/src/modules/admin/tenant-settings/utils/unpaidStartRule.ts
var UNPAID_START_RULES = ["month_start", "customer_start_day"];
function parseUnpaidStartRule(value) {
	const v = value?.trim();
	return v && UNPAID_START_RULES.includes(v) ? v : DEFAULT_UNPAID_START_RULE;
}
//#endregion
//#region ../Shared/src/core/utils/groupBy.ts
function groupBy(rows, key) {
	const out = new Map();
	for (const r of rows) {
		const k = key(r);
		const arr = out.get(k);
		if (arr) arr.push(r);
		else out.set(k, [r]);
	}
	return out;
}
//#endregion
//#region ../Shared/src/modules/customer/customer-payments/utils/monthDueRules.ts
function isBeforeStartDate(year, month, startDate) {
	const [sy, sm] = startDate.split("-").map(Number);
	return year < sy || year === sy && month < sm;
}
function getCurrentDayOfMonth() {
	return currentDate().getDate();
}
function startDayOfMonth(startDate) {
	const day = Number(startDate.split("-")[2]);
	return Number.isFinite(day) && day >= 1 ? day : 1;
}
function hasReachedStartDay(year, month, startDate) {
	const daysInMonth = new Date(year, month, 0).getDate();
	const dueDay = Math.min(startDayOfMonth(startDate), daysInMonth);
	return getCurrentDayOfMonth() >= dueDay;
}
function isNotDueYet(rule, year, month, startDate) {
	if (rule !== "customer_start_day") return false;
	const { year: cy, month: cm } = getCurrentYearMonth();
	if (year !== cy || month !== cm) return false;
	return !hasReachedStartDay(year, month, startDate);
}
function isNotLateYet(rule, year, month, startDate) {
	if (rule !== "customer_start_day") return false;
	const { year: cy, month: cm } = getCurrentYearMonth();
	if ((cy - year) * 12 + (cm - month) !== 1) return false;
	return !hasReachedStartDay(cy, cm, startDate);
}
function isUsageNotLateYet(billedAt) {
	const at = new Date(billedAt);
	const daysInNextMonth = new Date(at.getFullYear(), at.getMonth() + 2, 0).getDate();
	const lateFrom = new Date(at.getFullYear(), at.getMonth() + 1, Math.min(at.getDate(), daysInNextMonth));
	const today = currentDate();
	return new Date(today.getFullYear(), today.getMonth(), today.getDate()) < lateFrom;
}
//#endregion
//#region ../Shared/src/modules/customer/customer-plans/utils/linePrice.ts
function resolveLinePrice(line) {
	const plan = line.plan ?? null;
	const durationMonths = plan?.durationMonths ?? 1;
	if (line.customPrice != null) return {
		amount: line.customPrice,
		currencyId: line.customCurrencyId,
		durationMonths,
		isFixed: true,
		kind: "special"
	};
	if (plan && !plan.isCustomPrice && plan.price !== null) return {
		amount: plan.price,
		currencyId: plan.currencyId,
		durationMonths,
		isFixed: true,
		kind: "plan"
	};
	return {
		amount: null,
		currencyId: null,
		durationMonths,
		isFixed: false,
		kind: "typed"
	};
}
//#endregion
//#region ../Shared/src/modules/customer/customer-plans/utils/priceHistory.ts
var EMPTY_PRICE_HISTORY = {
	lines: new Map(),
	plans: new Map()
};
function priceHistoryOf(args) {
	return {
		lines: groupBy(args.lineChanges, (c) => c.customerPlanId),
		plans: groupBy(args.planChanges, (c) => c.planId)
	};
}
function isLater(a, b) {
	return a.createdAt > b.createdAt || a.createdAt === b.createdAt && a.id > b.id;
}
function changeAt(changes, month) {
	let reaching = null;
	let before = null;
	for (const change of changes ?? []) if (change.fromMonth === null) before = change;
	else if (change.fromMonth <= month && (!reaching || isLater(change, reaching))) reaching = change;
	return reaching ?? before;
}
function planAt(plan, month, history) {
	const change = changeAt(history.plans.get(plan.id), month);
	if (!change) return plan;
	return {
		...plan,
		price: change.price,
		currencyId: change.currencyId,
		durationMonths: change.durationMonths,
		isCustomPrice: change.isCustomPrice
	};
}
function linePriceAt(line, billingMonth, history) {
	const change = changeAt(history.lines.get(line.id), billingMonth);
	const plan = line.plan ?? null;
	return resolveLinePrice({
		customPrice: change ? change.customPrice : line.customPrice,
		customCurrencyId: change ? change.customCurrencyId : line.customCurrencyId,
		plan: plan ? planAt(plan, billingMonth, history) : null
	});
}
function isEarlierPrice(month, today) {
	if (!month.isFixed || month.amount === null || month.kind === "usage") return false;
	return month.amount !== today.amount || month.currencyId !== today.currencyId || month.durationMonths !== today.durationMonths;
}
//#endregion
//#region ../Shared/src/modules/customer/customer-payments/utils/usageBill.ts
var roundTo = (value, places) => {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
};
var waiting = (waitingFor) => ({
	kind: "waiting",
	waitingFor
});
function lineUsageOf(line, lineReadings, history) {
	const usage = line.plan?.usage;
	if (!usage || !line.planId) return null;
	return {
		entry: usage.entry,
		startDate: line.startDate,
		startReading: line.startReading,
		readings: new Map(lineReadings.map((r) => [r.billingMonth, r])),
		prices: history.plans.get(line.planId) ?? []
	};
}
function usageByLineOf(lines, readings, history) {
	const readingsByLine = groupBy(readings, (r) => r.customerPlanId);
	const byLine = new Map();
	for (const line of lines) {
		const usage = lineUsageOf(line, readingsByLine.get(line.id) ?? [], history);
		if (usage) byLine.set(line.id, usage);
	}
	return byLine;
}
function usagePriceAt(prices, billingMonth) {
	let latest = null;
	let first = null;
	for (const change of prices) {
		if (change.fromMonth !== billingMonth) continue;
		if (change.fixedFee === null || change.price === null) continue;
		if (!latest || isLater(change, latest)) latest = change;
		if (!first || isLater(first, change)) first = change;
	}
	if (!latest || !first) return null;
	return {
		unitPrice: latest.price ?? 0,
		fixedFee: latest.fixedFee ?? 0,
		currencyId: latest.currencyId,
		firstPricedAt: first.createdAt
	};
}
function previousReadingOf(usage, billingMonth) {
	if (billingMonth.slice(0, 7) === usage.startDate.slice(0, 7)) return usage.startReading;
	return usage.readings.get(shiftBillingMonth(billingMonth, -1))?.reading ?? null;
}
function unitsOf(usage, reading, billingMonth) {
	if (usage.entry === "direct") return reading.units === null ? { waitingFor: "reading" } : {
		units: reading.units,
		previousReading: null
	};
	if (reading.reading === null) return { waitingFor: "reading" };
	const previous = previousReadingOf(usage, billingMonth);
	if (previous === null) return { waitingFor: "previous_reading" };
	const change = reading.meterChange;
	const parts = change ? [change.oldMeterFinal - previous, reading.reading - change.newMeterStart] : [reading.reading - previous];
	if (parts.some((part) => part < 0)) return { waitingFor: "reading_below_previous" };
	return {
		units: roundTo(parts.reduce((sum, part) => sum + part, 0), 3),
		previousReading: previous
	};
}
function usageMonthOf(usage, billingMonth) {
	const reading = usage.readings.get(billingMonth);
	if (!reading) return waiting("reading");
	const units = unitsOf(usage, reading, billingMonth);
	if ("waitingFor" in units) return waiting(units.waitingFor);
	const price = usagePriceAt(usage.prices, billingMonth);
	if (!price) return waiting("price");
	return {
		kind: "bill",
		bill: {
			previousReading: units.previousReading,
			reading: usage.entry === "reading" ? reading.reading : null,
			units: units.units,
			unitPrice: price.unitPrice,
			fixedFee: price.fixedFee,
			amount: roundTo(price.fixedFee + units.units * price.unitPrice, 2),
			currencyId: price.currencyId,
			billedAt: reading.recordedAt > price.firstPricedAt ? reading.recordedAt : price.firstPricedAt
		}
	};
}
function workedOutBill(month) {
	return month?.kind === "bill" ? month.bill : null;
}
function chargeUsageOf(bill) {
	return {
		previousReading: bill.previousReading,
		reading: bill.reading,
		units: bill.units,
		unitPrice: bill.unitPrice,
		fixedFee: bill.fixedFee,
		computedAmount: bill.amount
	};
}
function monthPriceOf(line, month, history) {
	if (!line.plan?.usage) return linePriceAt(line, month.billingMonth, history);
	const bill = workedOutBill(month.usage);
	return {
		amount: bill?.amount ?? null,
		currencyId: bill?.currencyId ?? null,
		durationMonths: 1,
		isFixed: bill !== null,
		kind: "usage"
	};
}
function isEditedUsageBill(charge) {
	return !!charge.usage && charge.amount !== charge.usage.computedAmount;
}
//#endregion
//#region ../Shared/src/modules/customer/customer-payments/utils/monthStatus.ts
var NO_USAGE$1 = new Map();
function monthCells(line, bills, skips, year, unpaidRule = DEFAULT_UNPAID_START_RULE, usage = null) {
	const { year: cy, month: cm } = getCurrentYearMonth();
	const skipByMonth = new Map();
	for (const skip of skips) if (skip.skipped) skipByMonth.set(skip.billingMonth, skip);
	const coverageMap = new Map();
	for (const bill of bills) {
		const { charge } = bill;
		if (!charge.billingMonth) continue;
		const [pYear, pMonthNum] = charge.billingMonth.split("-").map(Number);
		for (let d = 0; d < charge.durationMonths; d++) {
			const date = new Date(pYear, pMonthNum - 1 + d, 1);
			const covYear = date.getFullYear();
			const covMonth = date.getMonth() + 1;
			if (covYear !== year) continue;
			const bm = toBillingMonth(covYear, covMonth);
			coverageMap.set(bm, {
				bill,
				isGroupSecondary: d > 0
			});
		}
	}
	return Array.from({ length: 12 }, (_, i) => {
		const month = i + 1;
		const billingMonth = toBillingMonth(year, month);
		const label = MONTHS[i];
		const coverage = coverageMap.get(billingMonth) ?? null;
		const bill = coverage?.bill ?? null;
		const isGroupSecondary = coverage?.isGroupSecondary ?? false;
		if (isBeforeStartDate(year, month, line.startDate)) return {
			year,
			month,
			label,
			billingMonth,
			status: "before_start",
			charge: null,
			collected: 0,
			isGroupSecondary: false,
			balance: 0,
			skip: null,
			usage: null
		};
		const collected = bill?.collected ?? 0;
		const isEffectivelyPaid = collected > 0;
		const skip = skipByMonth.get(billingMonth) ?? null;
		const isFuture = year > cy || year === cy && month > cm;
		const usageMonth = usage && !isFuture ? usageMonthOf(usage, billingMonth) : null;
		let status;
		if (isEffectivelyPaid) status = "paid";
		else if (bill?.charge.writtenOffAt) status = "written_off";
		else if (skip) status = "skipped";
		else if (isFuture) status = "future";
		else if (usageMonth) status = usageMonth.kind === "bill" || !!bill && isEditedUsageBill(bill.charge) ? "unpaid" : "waiting";
		else if (isNotDueYet(unpaidRule, year, month, line.startDate)) status = "future";
		else status = "unpaid";
		const balance = isEffectivelyPaid ? bill.charge.amount - collected : 0;
		return {
			year,
			month,
			label,
			billingMonth,
			status,
			charge: bill?.charge ?? null,
			collected,
			isGroupSecondary,
			balance,
			skip: status === "skipped" ? skip : null,
			usage: usageMonth
		};
	});
}
function isLateMonth(entry, line, unpaidRule) {
	if (entry.usage) return entry.usage.kind === "bill" && !isUsageNotLateYet(entry.usage.bill.billedAt);
	return !isNotLateYet(unpaidRule, entry.year, entry.month, line.startDate);
}
function isSettledStatus(status) {
	return status === "paid" || status === "written_off";
}
function buildCustomerStatus(lines, bills, skips, unpaidRule = DEFAULT_UNPAID_START_RULE, usageByLine = NO_USAGE$1) {
	const { year: currentYear, month: currentMonth } = getCurrentYearMonth();
	const notDueLineIds = [];
	const uncoveredLineIds = [];
	const unpaidMonths = new Set();
	let overdue = false;
	let anySkipped = false;
	let dueThisMonth = 0;
	let writtenOffThisMonth = 0;
	let inPlay = 0;
	let settled = 0;
	for (const line of lines) {
		if (!line.active) continue;
		const lineBills = bills.filter((b) => b.charge.customerPlanId === line.id);
		const lineSkips = skips.filter((s) => s.customerPlanId === line.id);
		const startYear = new Date(line.startDate).getFullYear();
		let current = null;
		let lineOverdue = false;
		let lineUncovered = false;
		let lineRequired = 0;
		let lineUnpaid = 0;
		for (let year = startYear; year <= currentYear; year++) for (const entry of monthCells(line, lineBills, lineSkips, year, unpaidRule, usageByLine.get(line.id) ?? null)) {
			if (isSettledStatus(entry.status) || entry.status === "unpaid") lineRequired++;
			if (entry.status === "unpaid") {
				lineUnpaid++;
				unpaidMonths.add(entry.billingMonth);
			}
			if (entry.year === currentYear && entry.month >= currentMonth) {
				if (entry.month === currentMonth) current = entry;
				continue;
			}
			if (entry.status !== "unpaid") continue;
			lineUncovered = true;
			if (isLateMonth(entry, line, unpaidRule)) lineOverdue = true;
		}
		if (lineOverdue) overdue = true;
		if (lineUncovered) uncoveredLineIds.push(line.id);
		if (lineRequired > 0) {
			inPlay++;
			if (lineUnpaid === 0) settled++;
		}
		if (!current || current.status === "before_start") continue;
		if (current.status === "skipped") {
			anySkipped = true;
			notDueLineIds.push(line.id);
			continue;
		}
		if (current.status === "future" || current.status === "waiting") continue;
		dueThisMonth++;
		if (current.status === "written_off") writtenOffThisMonth++;
		if (isSettledStatus(current.status)) notDueLineIds.push(line.id);
	}
	return {
		status: settled === inPlay ? dueThisMonth === 0 ? anySkipped ? "skipped" : "not_due_yet" : writtenOffThisMonth === dueThisMonth ? "written_off" : "paid" : settled > 0 ? "mixed" : "unpaid",
		overdue,
		planCount: {
			paid: settled,
			total: inPlay
		},
		notDueLineIds,
		uncoveredLineIds,
		unpaidMonths: unpaidMonths.size
	};
}
function getCustomerStatuses(customers, bills, skips, unpaidRule = DEFAULT_UNPAID_START_RULE, usageByLine = NO_USAGE$1) {
	const billsByCustomer = groupBy(bills, (b) => b.charge.customerId ?? "");
	const skipsByCustomer = groupBy(skips, (s) => s.customerId);
	const statuses = new Map();
	for (const customer of customers) {
		if (!customer.active || !customer.isRegular) continue;
		statuses.set(customer.id, buildCustomerStatus(customer.customerPlans ?? [], billsByCustomer.get(customer.id) ?? [], skipsByCustomer.get(customer.id) ?? [], unpaidRule, usageByLine));
	}
	return statuses;
}
//#endregion
//#region ../Shared/src/modules/ledger/utils/debtRule.ts
function isDebtItem(kind, paid) {
	return kind !== "month" || paid > 0;
}
function balanceUsd(balance, ratePerUsdSnapshot) {
	return balance / ratePerUsdSnapshot;
}
//#endregion
//#region ../Shared/src/modules/admin/plans/utils/mapper.ts
function usageOf(db) {
	if (db.billing_type !== "usage") return null;
	return {
		entry: db.usage_entry === "direct" ? "direct" : "reading",
		unitName: db.unit_name ?? "",
		feeName: db.fee_name ?? "",
		highUsagePercent: db.high_usage_percent != null ? Number(db.high_usage_percent) : null
	};
}
//#endregion
//#region ../Shared/src/modules/customer/customers/utils/customerStatusFacts.ts
function readPlans(wire) {
	return wire.map(([id, name, price, isCustomPrice, durationMonths, currencyId, branchId, tenantId, createdAt, billingType, usageEntry, unitName, feeName, highUsagePercent]) => ({
		id,
		name,
		price: price === null ? null : Number(price),
		isCustomPrice,
		durationMonths,
		currencyId,
		branchId,
		tenantId,
		createdAt,
		usage: usageOf({
			billing_type: billingType ?? null,
			usage_entry: usageEntry ?? null,
			unit_name: unitName ?? null,
			fee_name: feeName ?? null,
			high_usage_percent: highUsagePercent ?? null
		})
	}));
}
function readPrices(wire) {
	return priceHistoryOf({
		planChanges: (wire.planChanges ?? []).map(([id, planId, fromMonth, price, currencyId, durationMonths, isCustomPrice, createdAt, fixedFee]) => ({
			id,
			planId,
			fromMonth,
			price: price === null ? null : Number(price),
			currencyId,
			durationMonths,
			isCustomPrice,
			fixedFee: fixedFee == null ? null : Number(fixedFee),
			createdAt
		})),
		lineChanges: (wire.specialPriceChanges ?? []).map(([id, customerId, customerPlanId, fromMonth, customPrice, customCurrencyId, createdAt]) => ({
			id,
			customerId,
			customerPlanId,
			fromMonth,
			customPrice: customPrice === null ? null : Number(customPrice),
			customCurrencyId,
			createdAt
		}))
	});
}
var toNumber = (value) => value === null ? null : Number(value);
function readReadings(wire) {
	return wire.map(([customerPlanId, billingMonth, reading, units, oldMeterFinal, newMeterStart, newMeterNumber, recordedAt]) => ({
		customerPlanId,
		billingMonth,
		reading: toNumber(reading),
		units: toNumber(units),
		meterChange: oldMeterFinal === null || newMeterStart === null ? null : {
			oldMeterFinal: Number(oldMeterFinal),
			newMeterStart: Number(newMeterStart),
			newMeterNumber
		},
		recordedAt
	}));
}
function readCustomerStatusFacts(wire, unpaidRule) {
	const plans = readPlans(wire.plans ?? []);
	const planById = new Map(plans.map((p) => [p.id, p]));
	const customers = new Map();
	for (const [id, name, phoneNumber, address, area, active, isRegular, portalEnabled = false, createdAt = "", lastPaidAt = null] of wire.customers) customers.set(id, {
		id,
		name,
		phoneNumber,
		address,
		area,
		active,
		isRegular,
		portalEnabled,
		createdAt,
		lastPaidAt,
		customerPlans: []
	});
	const bills = [];
	const skips = [];
	for (const [id, customerId, startDate, active, lineBills, skipped, planId = null, customPrice = null, customCurrencyId = null, startReading = null] of wire.lines) {
		customers.get(customerId)?.customerPlans.push({
			id,
			startDate,
			active,
			planId,
			customPrice: toNumber(customPrice),
			customCurrencyId,
			startReading: toNumber(startReading),
			plan: planId ? planById.get(planId) ?? null : null
		});
		for (const [billingMonth, durationMonths, amount, paid, writtenOffAt = null, computedAmount = null] of lineBills) bills.push({
			charge: {
				customerId,
				customerPlanId: id,
				billingMonth,
				durationMonths,
				amount: Number(amount),
				voidedAt: null,
				writtenOffAt,
				usage: computedAmount === null ? null : { computedAmount: Number(computedAmount) }
			},
			collected: Number(paid)
		});
		for (const billingMonth of skipped) skips.push({
			customerId,
			customerPlanId: id,
			billingMonth,
			skipped: true
		});
	}
	const open = [];
	const debtUsd = new Map();
	for (const [customerId, kind, balance, paid, rate, customerPlanId = null, billingMonth = null] of wire.debts) {
		const fact = {
			customerId,
			kind,
			balance: Number(balance),
			paid: Number(paid),
			ratePerUsdSnapshot: Number(rate),
			customerPlanId,
			billingMonth
		};
		open.push(fact);
		if (!isDebtItem(kind, fact.paid)) continue;
		const usd = balanceUsd(fact.balance, fact.ratePerUsdSnapshot);
		debtUsd.set(customerId, (debtUsd.get(customerId) ?? 0) + usd);
	}
	const prices = readPrices(wire);
	const customerList = [...customers.values()];
	return {
		customers: customerList,
		bills,
		skips,
		open,
		debtUsd,
		prices,
		usageByLine: usageByLineOf(customerList.flatMap((c) => c.customerPlans), readReadings(wire.readings ?? []), prices),
		currencies: (wire.currencies ?? []).map(([id, ratePerUsd]) => ({
			id,
			ratePerUsd: Number(ratePerUsd)
		})),
		unpaidRule
	};
}
//#endregion
//#region ../Shared/src/core/utils/currency.ts
function findCurrency(currencies, id) {
	if (!id) return null;
	return currencies.find((c) => c.id === id) ?? null;
}
//#endregion
//#region ../Shared/src/modules/customer/customer-payments/utils/monthSelection.ts
function absOf(year, month) {
	return year * 12 + (month - 1);
}
function billingMonthFromAbs(abs) {
	return toBillingMonth(Math.floor(abs / 12), abs % 12 + 1);
}
function startAbs(startDate) {
	const d = new Date(startDate);
	return absOf(d.getFullYear(), d.getMonth() + 1);
}
function blockStartAbs(abs, startDate, n) {
	const base = startAbs(startDate);
	return base + Math.floor((abs - base) / n) * n;
}
function blockStartMonth(billingMonth, startDate, n) {
	const [year, month] = billingMonth.split("-").map(Number);
	return billingMonthFromAbs(blockStartAbs(absOf(year, month), startDate, n));
}
//#endregion
//#region ../Shared/src/modules/customer/customer-payments/utils/blockRangeLabel.ts
function getBlockRangeLabel(billingMonth, durationMonths, t) {
	const [startYear, startMonthNum] = billingMonth.split("-").map(Number);
	const startLabel = MONTHS[startMonthNum - 1];
	if (durationMonths === 1) return `${t(`months.${startLabel}`)} ${startYear}`;
	const endDate = new Date(startYear, startMonthNum - 1 + durationMonths - 1, 1);
	const endLabel = MONTHS[endDate.getMonth()];
	const endYear = endDate.getFullYear();
	if (startYear === endYear) return `${t(`months.${startLabel}`)} – ${t(`months.${endLabel}`)} ${startYear}`;
	return `${t(`months.${startLabel}`)} ${startYear} – ${t(`months.${endLabel}`)} ${endYear}`;
}
//#endregion
//#region ../Shared/src/modules/ledger/utils/virtualMonthItem.ts
function virtualMonthItem(args) {
	return {
		chargeId: null,
		kind: "month",
		customerId: args.customerId,
		customerName: args.customerName,
		branchId: args.branchId,
		customerPlanId: args.customerPlanId,
		billingMonth: args.billingMonth,
		durationMonths: args.durationMonths,
		planId: args.planId,
		saleId: null,
		label: args.label,
		amount: args.amount,
		paid: 0,
		balance: args.amount,
		currencyId: args.currencyId,
		ratePerUsdSnapshot: args.ratePerUsdSnapshot,
		dueDate: args.dueDate,
		issuedAt: args.dueDate,
		createdAt: args.dueDate,
		isDebt: false,
		openAmount: args.openAmount ?? false,
		earlierPrice: args.earlierPrice ?? false,
		usage: args.usage ?? null
	};
}
//#endregion
//#region ../Shared/src/modules/ledger/utils/mergeOwed.ts
var NO_USAGE = new Map();
var monthKey = (item) => `${item.customerPlanId}:${item.billingMonth}`;
function owedOf(args) {
	const usageByLine = args.usageByLine ?? NO_USAGE;
	const billed = new Set(args.stored.filter((i) => i.kind === "month" && i.paid > 0).map(monthKey));
	const virtual = virtualUnpaidMonths({
		customer: args.customer,
		activeLines: args.lines.filter((l) => l.active),
		billsByLine: args.billsByLine,
		skips: args.skips,
		unpaidRule: args.unpaidRule,
		currencies: args.currencies,
		alreadyBilled: billed,
		prices: args.prices ?? EMPTY_PRICE_HISTORY,
		usageByLine,
		today: args.today ?? currentDate(),
		withOpenMonths: args.withOpenMonths ?? false
	});
	const revalued = new Set([...virtual.map(monthKey), ...waitingUsageBills(args.lines, args.billsByLine, usageByLine)]);
	return [...args.stored.filter((i) => i.kind !== "month" || i.paid > 0 || !revalued.has(monthKey(i))), ...virtual];
}
function waitingUsageBills(lines, billsByLine, usageByLine) {
	const keys = [];
	for (const line of lines) {
		const usage = usageByLine.get(line.id);
		if (!usage) continue;
		for (const { charge, collected } of billsByLine.get(line.id) ?? []) {
			const month = charge.billingMonth;
			if (collected > 0 || !month || isEditedUsageBill(charge)) continue;
			if (usageMonthOf(usage, month).kind === "waiting") keys.push(`${line.id}:${month}`);
		}
	}
	return keys;
}
var monthName = (key) => key.slice(7);
function virtualUnpaidMonths(args) {
	const { customer, activeLines, billsByLine, skips, unpaidRule, currencies, alreadyBilled, prices, usageByLine, today, withOpenMonths } = args;
	const out = [];
	for (const line of activeLines) {
		const todayPrice = resolveLinePrice(line);
		const blockMonths = todayPrice.durationMonths;
		const bills = billsByLine.get(line.id) ?? [];
		const lineSkips = skips.filter((s) => s.customerPlanId === line.id);
		const usage = usageByLine.get(line.id) ?? null;
		const startYear = new Date(line.startDate).getFullYear();
		const listed = new Set();
		for (let year = startYear; year <= today.getFullYear(); year++) for (const entry of monthCells(line, bills, lineSkips, year, unpaidRule, usage)) {
			if (entry.status !== "unpaid") continue;
			if (entry.charge && isEditedUsageBill(entry.charge)) continue;
			const billingMonth = blockMonths > 1 ? blockStartMonth(entry.billingMonth, line.startDate, blockMonths) : entry.billingMonth;
			if (listed.has(billingMonth)) continue;
			listed.add(billingMonth);
			if (alreadyBilled.has(`${line.id}:${billingMonth}`)) continue;
			const price = monthPriceOf(line, {
				billingMonth,
				usage: entry.usage
			}, prices);
			const usageBill = workedOutBill(entry.usage);
			const priced = price.isFixed && price.amount !== null && price.amount > 0;
			if (!priced && !withOpenMonths) continue;
			out.push(virtualMonthItem({
				customerId: customer.id,
				customerName: customer.name,
				branchId: customer.branchId ?? null,
				customerPlanId: line.id,
				billingMonth,
				durationMonths: price.durationMonths,
				planId: line.planId,
				label: `${getBlockRangeLabel(billingMonth, price.durationMonths, monthName)}${line.plan?.name ? ` · ${line.plan.name}` : ""}`,
				amount: priced ? price.amount : 0,
				currencyId: priced ? price.currencyId : null,
				ratePerUsdSnapshot: priced ? findCurrency(currencies, price.currencyId)?.ratePerUsd ?? 1 : 1,
				dueDate: billingMonth,
				openAmount: !priced,
				earlierPrice: isEarlierPrice(price, todayPrice),
				usage: usageBill ? chargeUsageOf(usageBill) : null
			}));
		}
	}
	return out;
}
//#endregion
//#region ../Shared/src/modules/customer/customers/utils/customerToCollect.ts
function toCollectByCustomer(facts) {
	const billsByLine = groupBy(facts.bills, (b) => b.charge.customerPlanId ?? "");
	const skipsByCustomer = groupBy(facts.skips, (s) => s.customerId);
	const openByCustomer = groupBy(facts.open, (bill) => bill.customerId);
	const totals = new Map();
	for (const customer of facts.customers) {
		const stored = openByCustomer.get(customer.id) ?? [];
		const usd = (customer.active && customer.isRegular ? owedOf({
			customer,
			lines: customer.customerPlans,
			skips: skipsByCustomer.get(customer.id) ?? [],
			unpaidRule: facts.unpaidRule,
			currencies: facts.currencies,
			stored,
			billsByLine,
			prices: facts.prices,
			usageByLine: facts.usageByLine
		}) : stored.filter((bill) => isDebtItem(bill.kind, bill.paid))).reduce((sum, item) => sum + balanceUsd(item.balance, item.ratePerUsdSnapshot), 0);
		if (usd > 0) totals.set(customer.id, usd);
	}
	return totals;
}
//#endregion
//#region ../Shared/src/core/utils/activeFilter.ts
function matchesActiveFilter(active, filter) {
	return filter === "all" || active === (filter === "active");
}
//#endregion
//#region ../Shared/src/modules/customer/customers/utils/customerFlags.ts
function customerFlags(status) {
	if (!status) return [];
	const flags = [];
	if (!(status.status === "unpaid" && status.overdue)) flags.push(status.status);
	if (status.overdue) flags.push("overdue");
	return flags;
}
function owesMoney(usd) {
	return (usd ?? 0) > 0;
}
//#endregion
//#region ../Shared/src/modules/customer/customers/utils/customerFilters.ts
var STATUS_FILTER_LABEL_KEYS = {
	active: "common.active",
	inactive: "common.inactive",
	all: "customers.filters.all_customers"
};
var PAYMENT_FILTER_LABEL_KEYS = {
	paid: "common.paid",
	written_off: "payments.written_off_badge",
	unpaid: "dashboard.unpaid",
	overdue: "customers.overdue",
	mixed: "customers.partly_paid",
	not_due_yet: "payments.not_due_yet_label"
};
var OWES_FILTER_LABEL_KEYS = {
	anything: "customers.filters.owes_anything",
	debts: "customers.has_debts",
	nothing: "customers.filters.owes_nothing"
};
var TYPE_FILTER_LABEL_KEYS = {
	regular: "customers.filters.type_regular",
	occasional: "customers.filters.type_occasional"
};
var PHONE_FILTER_LABEL_KEYS = {
	yes: "customers.filters.phone_yes",
	no: "customers.filters.phone_no"
};
var PORTAL_FILTER_LABEL_KEYS = {
	yes: "customers.filters.portal_yes",
	no: "customers.filters.portal_no"
};
var UNPAID_MONTHS_OPTIONS = [
	1,
	2,
	3,
	6
];
var SORT_LABEL_KEYS = {
	name: "customers.filters.sort_name",
	to_collect: "customers.filters.sort_to_collect",
	unpaid_months: "customers.filters.sort_unpaid_months",
	longest_unpaid: "customers.filters.sort_longest_unpaid",
	newest: "customers.filters.sort_newest"
};
function labelKeysOf(labels) {
	return Object.keys(labels);
}
function matchesYesNo(choice, fact) {
	return choice === null || choice === "yes" === fact;
}
function matchesOwes(choice, facts) {
	if (choice === null) return true;
	if (choice === "debts") return owesMoney(facts.debtUsd);
	return owesMoney(facts.toCollectUsd) === (choice === "anything");
}
var PAYMENT_FILTER_FLAGS = {
	paid: ["paid"],
	written_off: ["written_off"],
	unpaid: ["unpaid", "overdue"],
	overdue: ["overdue"],
	mixed: ["mixed"],
	not_due_yet: ["not_due_yet"]
};
function matchesPayment(customer, status, payment) {
	if (payment.length === 0) return true;
	if (!customer.active || !customer.isRegular) return false;
	const flags = customerFlags(status);
	return payment.some((p) => PAYMENT_FILTER_FLAGS[p].some((flag) => flags.includes(flag)));
}
function matchesPlan(customer, planId) {
	if (planId.length === 0) return true;
	const planIds = (customer.customerPlans ?? []).filter((line) => line.active && line.planId !== null).map((line) => line.planId);
	return planId.some((p) => p === "none" ? planIds.length === 0 : planIds.includes(p));
}
function matchesLastPaid(lastPaidAt, sinceIso, beforeIso) {
	if (sinceIso === null && beforeIso === null) return true;
	if (!lastPaidAt) return false;
	const paid = Date.parse(lastPaidAt);
	if (sinceIso !== null && paid < Date.parse(sinceIso)) return false;
	return beforeIso === null || paid < Date.parse(beforeIso);
}
function hasPhoneNumber(customer) {
	return !!customer.phoneNumber?.trim();
}
function matchesCustomerFilters(customer, facts, filters) {
	return matchesActiveFilter(customer.active, filters.status) && matchesPayment(customer, facts.status, filters.payment) && matchesOwes(filters.owes, facts) && matchesPlan(customer, filters.planId) && (filters.unpaidMonths === null || (facts.status?.unpaidMonths ?? 0) >= filters.unpaidMonths) && (filters.type === null || customer.isRegular === (filters.type === "regular")) && matchesYesNo(filters.phone, hasPhoneNumber(customer)) && matchesYesNo(filters.portal, customer.portalEnabled) && matchesLastPaid(facts.lastPaidAt, filters.paidSinceIso, filters.paidBeforeIso);
}
function isOneOf(values, value) {
	return values.includes(value);
}
function isNullOr(values, value) {
	return value === null || isOneOf(values, value);
}
function isInstantOrNull(value) {
	return value === null || typeof value === "string" && !Number.isNaN(Date.parse(value));
}
var ID_PATTERN = /^[0-9a-f-]{36}$/i;
function isPaymentFilterValue(value) {
	const allowed = labelKeysOf(PAYMENT_FILTER_LABEL_KEYS);
	return Array.isArray(value) && value.every((item) => isOneOf(allowed, item));
}
function isPlanFilterValue(value) {
	return Array.isArray(value) && value.every((item) => typeof item === "string" && (item === "none" || ID_PATTERN.test(item)));
}
function isCustomerFilterQuery(value) {
	if (!value || typeof value !== "object") return false;
	const f = value;
	return isOneOf(labelKeysOf(STATUS_FILTER_LABEL_KEYS), f.status) && isPaymentFilterValue(f.payment) && isNullOr(labelKeysOf(OWES_FILTER_LABEL_KEYS), f.owes) && isPlanFilterValue(f.planId) && isNullOr(UNPAID_MONTHS_OPTIONS, f.unpaidMonths) && isNullOr(labelKeysOf(TYPE_FILTER_LABEL_KEYS), f.type) && isNullOr(labelKeysOf(PHONE_FILTER_LABEL_KEYS), f.phone) && isNullOr(labelKeysOf(PORTAL_FILTER_LABEL_KEYS), f.portal) && isInstantOrNull(f.paidSinceIso) && isInstantOrNull(f.paidBeforeIso);
}
function isCustomerSort(value) {
	return isOneOf(labelKeysOf(SORT_LABEL_KEYS), value);
}
//#endregion
//#region ../Shared/src/modules/customer/customers/utils/customerStatusPage.ts
var MAX_STATUS_PAGE_SIZE = 100;
var MAX_SEARCH_LENGTH = 200;
var DAY_MS = 864e5;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function matchesCustomerSearch(customer, term) {
	if (!term) return true;
	return [
		customer.name,
		customer.phoneNumber,
		customer.address,
		customer.area
	].some((field) => field?.toLowerCase().includes(term));
}
function byName(a, b) {
	const x = a.customer;
	const y = b.customer;
	return x.name.localeCompare(y.name) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
}
function paidTime(customer) {
	return customer.lastPaidAt ? Date.parse(customer.lastPaidAt) : -Infinity;
}
var SORTS = {
	name: () => 0,
	to_collect: (a, b) => b.row.toCollectUsd - a.row.toCollectUsd,
	unpaid_months: (a, b) => (b.row.status?.unpaidMonths ?? 0) - (a.row.status?.unpaidMonths ?? 0),
	longest_unpaid: (a, b) => paidTime(a.customer) - paidTime(b.customer),
	newest: (a, b) => b.customer.createdAt.localeCompare(a.customer.createdAt)
};
function pageCustomerStatuses(facts, query) {
	const statuses = getCustomerStatuses(facts.customers, facts.bills, facts.skips, facts.unpaidRule, facts.usageByLine);
	const toCollect = toCollectByCustomer(facts);
	const term = sanitizeSearchTerm(query.search).toLowerCase();
	const matched = [];
	for (const customer of facts.customers) {
		if (!matchesCustomerSearch(customer, term)) continue;
		const row = {
			customerId: customer.id,
			status: statuses.get(customer.id) ?? null,
			debtUsd: facts.debtUsd.get(customer.id) ?? 0,
			toCollectUsd: toCollect.get(customer.id) ?? 0
		};
		if (matchesCustomerFilters(customer, {
			...row,
			lastPaidAt: customer.lastPaidAt
		}, query.filters)) matched.push({
			customer,
			row
		});
	}
	const order = SORTS[query.sort];
	matched.sort((a, b) => order(a, b) || byName(a, b));
	return {
		rows: matched.slice(query.offset, query.offset + query.limit).map(({ row }) => row),
		total: matched.length
	};
}
function customerStatusPage(wire, settings, request) {
	const storedRule = settings.find((s) => s.key === TENANT_SETTING_KEYS.unpaidStartRule)?.value;
	const facts = readCustomerStatusFacts(wire, parseUnpaidStartRule(storedRule));
	return onCalendarDay(request.today, () => pageCustomerStatuses(facts, request));
}
function factsRpcArgs(branch) {
	return {
		p_branch_id: branch && branch !== "unassigned" ? branch : null,
		p_unassigned: branch === BRANCH_FILTER_UNASSIGNED
	};
}
function isWholeNumber(value, min, max) {
	return Number.isInteger(value) && value >= min && value <= max;
}
function isBranchFilter(value) {
	return value === null || value === "unassigned" || typeof value === "string" && UUID.test(value);
}
function isNearToday(day, now) {
	const [y, m, d] = day.split("-").map(Number);
	const serverDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	return Math.abs(Date.UTC(y, m - 1, d) - serverDay) <= DAY_MS;
}
function parseCustomerStatusRequest(body, now) {
	const { search = "", filters, sort = "name", branch = null, offset, limit, today } = body;
	if (typeof search !== "string" || search.length > MAX_SEARCH_LENGTH) return {
		ok: false,
		message: "The search text is too long."
	};
	if (!isCustomerFilterQuery(filters)) return {
		ok: false,
		message: "Unknown customer filter."
	};
	if (!isCustomerSort(sort)) return {
		ok: false,
		message: "Unknown customer sort."
	};
	if (!isBranchFilter(branch)) return {
		ok: false,
		message: "Unknown branch."
	};
	if (!isWholeNumber(offset, 0, Number.MAX_SAFE_INTEGER)) return {
		ok: false,
		message: "The page offset is not valid."
	};
	if (!isWholeNumber(limit, 1, 100)) return {
		ok: false,
		message: `A page holds 1 to 100 customers.`
	};
	if (typeof today !== "string" || !isValidDateString(today) || !isNearToday(today, now)) return {
		ok: false,
		message: "Your device date looks wrong. Check it and try again."
	};
	return {
		ok: true,
		request: {
			search,
			filters,
			sort,
			branch,
			offset,
			limit,
			today
		}
	};
}
//#endregion
export { MAX_STATUS_PAGE_SIZE, customerStatusPage, factsRpcArgs, matchesCustomerSearch, pageCustomerStatuses, parseCustomerStatusRequest };
