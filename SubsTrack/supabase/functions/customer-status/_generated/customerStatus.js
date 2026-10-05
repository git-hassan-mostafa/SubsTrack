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
function toBillingMonth(year, month) {
	return `${year}-${String(month).padStart(2, "0")}-01`;
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
	return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
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
//#endregion
//#region ../Shared/src/modules/customer/customer-payments/utils/monthStatus.ts
function monthCells(line, bills, skips, year, unpaidRule = DEFAULT_UNPAID_START_RULE) {
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
			skip: null
		};
		const collected = bill?.collected ?? 0;
		const isEffectivelyPaid = collected > 0;
		const skip = skipByMonth.get(billingMonth) ?? null;
		let status;
		if (isEffectivelyPaid) status = "paid";
		else if (skip) status = "skipped";
		else if (year > cy || year === cy && month > cm) status = "future";
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
			skip: status === "skipped" ? skip : null
		};
	});
}
function buildCustomerStatus(lines, bills, skips, unpaidRule = DEFAULT_UNPAID_START_RULE) {
	const { year: currentYear, month: currentMonth } = getCurrentYearMonth();
	const notDueLineIds = [];
	const uncoveredLineIds = [];
	const unpaidMonths = new Set();
	let overdue = false;
	let anySkipped = false;
	let dueThisMonth = 0;
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
		for (let year = startYear; year <= currentYear; year++) for (const entry of monthCells(line, lineBills, lineSkips, year, unpaidRule)) {
			if (entry.status === "paid" || entry.status === "unpaid") lineRequired++;
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
			if (!isNotLateYet(unpaidRule, entry.year, entry.month, line.startDate)) lineOverdue = true;
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
		if (current.status === "future") continue;
		dueThisMonth++;
		if (current.status === "paid") notDueLineIds.push(line.id);
	}
	return {
		status: settled === inPlay ? dueThisMonth === 0 ? anySkipped ? "skipped" : "not_due_yet" : "paid" : settled > 0 ? "mixed" : "unpaid",
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
function getCustomerStatuses(customers, bills, skips, unpaidRule = DEFAULT_UNPAID_START_RULE) {
	const billsByCustomer = groupBy(bills, (b) => b.charge.customerId ?? "");
	const skipsByCustomer = groupBy(skips, (s) => s.customerId);
	const statuses = new Map();
	for (const customer of customers) {
		if (!customer.active || !customer.isRegular) continue;
		statuses.set(customer.id, buildCustomerStatus(customer.customerPlans ?? [], billsByCustomer.get(customer.id) ?? [], skipsByCustomer.get(customer.id) ?? [], unpaidRule));
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
//#region ../Shared/src/modules/customer/customers/utils/customerStatusFacts.ts
function readCustomerStatusFacts(wire, unpaidRule) {
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
	for (const [id, customerId, startDate, active, lineBills, skipped, planId = null] of wire.lines) {
		customers.get(customerId)?.customerPlans.push({
			id,
			startDate,
			active,
			planId
		});
		for (const [billingMonth, durationMonths, amount, paid] of lineBills) bills.push({
			charge: {
				customerId,
				customerPlanId: id,
				billingMonth,
				durationMonths,
				amount: Number(amount),
				voidedAt: null
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
	const debtUsd = new Map();
	for (const [customerId, kind, balance, paid, rate] of wire.debts) {
		if (!isDebtItem(kind, Number(paid))) continue;
		const usd = balanceUsd(Number(balance), Number(rate));
		debtUsd.set(customerId, (debtUsd.get(customerId) ?? 0) + usd);
	}
	return {
		customers: [...customers.values()],
		bills,
		skips,
		debtUsd,
		unpaidRule
	};
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
function hasDebtFlag(netUsd) {
	return (netUsd ?? 0) > 0;
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
	unpaid: "dashboard.unpaid",
	overdue: "customers.overdue",
	mixed: "customers.partly_paid",
	not_due_yet: "payments.not_due_yet_label"
};
var DEBT_FILTER_LABEL_KEYS = {
	yes: "customers.has_debts",
	no: "customers.filters.no_debts"
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
	debt: "customers.filters.sort_debt",
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
function matchesPayment(customer, status, payment) {
	if (payment === null) return true;
	if (!customer.active || !customer.isRegular) return false;
	return customerFlags(status).includes(payment);
}
function matchesPlan(customer, planId) {
	if (planId === null) return true;
	return (customer.customerPlans ?? []).some((line) => line.active && line.planId === planId);
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
	return matchesActiveFilter(customer.active, filters.status) && matchesPayment(customer, facts.status, filters.payment) && matchesYesNo(filters.debt, hasDebtFlag(facts.debtUsd)) && matchesPlan(customer, filters.planId) && (filters.unpaidMonths === null || (facts.status?.unpaidMonths ?? 0) >= filters.unpaidMonths) && (filters.type === null || customer.isRegular === (filters.type === "regular")) && matchesYesNo(filters.phone, hasPhoneNumber(customer)) && matchesYesNo(filters.portal, customer.portalEnabled) && matchesLastPaid(facts.lastPaidAt, filters.paidSinceIso, filters.paidBeforeIso);
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
function isCustomerFilterQuery(value) {
	if (!value || typeof value !== "object") return false;
	const f = value;
	return isOneOf(labelKeysOf(STATUS_FILTER_LABEL_KEYS), f.status) && isNullOr(labelKeysOf(PAYMENT_FILTER_LABEL_KEYS), f.payment) && isNullOr(labelKeysOf(DEBT_FILTER_LABEL_KEYS), f.debt) && (f.planId === null || typeof f.planId === "string" && ID_PATTERN.test(f.planId)) && isNullOr(UNPAID_MONTHS_OPTIONS, f.unpaidMonths) && isNullOr(labelKeysOf(TYPE_FILTER_LABEL_KEYS), f.type) && isNullOr(labelKeysOf(PHONE_FILTER_LABEL_KEYS), f.phone) && isNullOr(labelKeysOf(PORTAL_FILTER_LABEL_KEYS), f.portal) && isInstantOrNull(f.paidSinceIso) && isInstantOrNull(f.paidBeforeIso);
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
	debt: (a, b) => b.row.debtUsd - a.row.debtUsd,
	unpaid_months: (a, b) => (b.row.status?.unpaidMonths ?? 0) - (a.row.status?.unpaidMonths ?? 0),
	longest_unpaid: (a, b) => paidTime(a.customer) - paidTime(b.customer),
	newest: (a, b) => b.customer.createdAt.localeCompare(a.customer.createdAt)
};
function pageCustomerStatuses(facts, query) {
	const statuses = getCustomerStatuses(facts.customers, facts.bills, facts.skips, facts.unpaidRule);
	const term = sanitizeSearchTerm(query.search).toLowerCase();
	const matched = [];
	for (const customer of facts.customers) {
		if (!matchesCustomerSearch(customer, term)) continue;
		const row = {
			customerId: customer.id,
			status: statuses.get(customer.id) ?? null,
			debtUsd: facts.debtUsd.get(customer.id) ?? 0
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
