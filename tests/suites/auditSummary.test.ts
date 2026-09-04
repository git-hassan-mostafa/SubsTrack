import en from '@/src/core/i18n/locales/en.json';

// billingMonthLabel reads the i18n SINGLETON, so the shared stub (which echoes
// the key) would leak "months_long.mar" into every asserted sentence. Resolve
// real en.json here instead — a missing key then fails the test, which is the
// point: the sentence catalogue must stay complete.
jest.mock('@/src/core/i18n', () => ({
  __esModule: true,
  default: {
    language: 'en',
    t: (key: string, opts?: Record<string, unknown>) => mockTranslate(key, opts),
  },
  SUPPORTED_LANGUAGES: ['en', 'ar'],
  FALLBACK_LANGUAGE: 'en',
}));

import type { AuditChange, AuditEntry, AuditTable, Currency } from '@/src/core/types';
import { buildAuditSummary } from '@/src/modules/admin/audit/utils/summary';
import { bold, toParts } from '@/src/modules/admin/audit/utils/sentence';
import type { AuditFieldContext, AuditLookups } from '@/src/modules/admin/audit/utils/valueDisplay';

function lookupKey(key: string): string | undefined {
  const found = key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    en,
  );
  return typeof found === 'string' ? found : undefined;
}

function mockTranslate(key: string, opts?: Record<string, unknown>): string {

  const count = opts?.count;
  const raw =
    (typeof count === 'number' && count !== 1 ? lookupKey(`${key}_plural`) : undefined) ??
    lookupKey(key);
  if (raw === undefined) return key;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(opts?.[name] ?? ''));
}

const USD: Currency = {
  id: 'cur-usd',
  tenantId: 't1',
  code: 'USD',
  name: 'Dollar',
  symbol: '$',
  ratePerUsd: 1,
  decimals: 2,
  active: true,
  createdAt: '',
  updatedAt: '',
};

const lookups: AuditLookups = {
  user: (id) => (id === 'u1' ? 'Super Admin' : null),
  currency: (id) => (id === USD.id ? USD.code : null),
  currencyObject: (id) => (id === USD.id ? USD : null),
  branch: () => null,
  plan: (id) => (id === 'p1' ? 'Gold' : null),
};

const t = mockTranslate as unknown as AuditFieldContext['t'];

function entry(over: Partial<AuditEntry> & { table: AuditTable }): AuditEntry {
  return {
    id: 'a1',
    tenantId: 't1',
    branchId: null,
    recordId: '00000000-0000-0000-0000-0000000ab12c',
    action: 'update',
    changes: [],
    snapshot: null,
    context: {},
    label: null,
    subject: null,
    subjectId: null,
    actorUserId: 'u1',
    actorUsername: 'sadmin',
    occurredAt: '2026-03-04T15:12:00.000Z',
    ...over,
  };
}

function ctxFor(e: AuditEntry): AuditFieldContext {
  return { t, locale: 'en-US', table: e.table, row: e.context, lookups };
}

function sentence(e: AuditEntry, showSubject = true): string {
  return buildAuditSummary(e, ctxFor(e), { showSubject })
    .map((p) => p.text)
    .join('');
}

function bolded(e: AuditEntry): string[] {
  return buildAuditSummary(e, ctxFor(e))
    .filter((p) => p.bold)
    .map((p) => p.text);
}

function change(field: string, before: unknown, after: unknown): AuditChange {
  return { field, before, after };
}

// TC-AS-* — the audit trail reads as a sentence. Every case here is a shape the
// generic "{actor} updated the {record}" would state wrongly or unreadably.

describe('toParts', () => {
  it('TC-AS-01 a plain sentence is one non-bold run', () => {
    expect(toParts('nothing marked')).toEqual([{ text: 'nothing marked', bold: false }]);
  });

  it('TC-AS-02 splits marked runs and keeps the spaces on the plain ones', () => {
    expect(toParts('a B c')).toEqual([
      { text: 'a ', bold: false },
      { text: 'B', bold: true },
      { text: ' c', bold: false },
    ]);
  });

  it('TC-AS-03 an unclosed marker runs to the end instead of throwing', () => {
    expect(toParts('a B')).toEqual([
      { text: 'a ', bold: false },
      { text: 'B', bold: true },
    ]);
  });
});

describe('buildAuditSummary', () => {
  it('TC-AS-04 a create names the actor and the new record', () => {
    const e = entry({ table: 'customers', action: 'create', snapshot: { name: 'John Doe' }, subject: 'John Doe' });
    expect(sentence(e)).toBe('Super Admin added a new customer John Doe');
    expect(bolded(e)).toEqual(['Super Admin', 'John Doe']);
  });

  it('TC-AS-05 a month bill void names the month and the customer', () => {
    const e = entry({
      table: 'charges',
      action: 'void',
      subject: 'John Doe',
      changes: [change('voided_at', null, '2026-03-04T15:12:00.000Z')],
      context: { kind: 'month', billing_month: '2026-03-01' },
    });
    expect(sentence(e)).toBe('Super Admin voided the March 2026 bill for John Doe');
    expect(bolded(e)).toEqual(['Super Admin', 'March 2026', 'John Doe']);
  });

  it('TC-AS-06 a single-field edit carries old and new, money formatted', () => {
    const e = entry({
      table: 'plans',
      changes: [change('price', 10, 12)],
      context: { name: 'Gold', price: 12, currency_id: USD.id },
    });
    expect(sentence(e)).toBe('Super Admin changed price on the plan Gold from 10.00 $ to 12.00 $');
  });

  it('TC-AS-07 many changed fields collapse to two plus a count', () => {
    const e = entry({
      table: 'plans',
      changes: [
        change('price', 10, 12),
        change('name', 'Silver', 'Gold'),
        change('duration_months', 1, 3),
        change('branch_id', null, 'b1'),
        change('currency_id', null, USD.id),
      ],
      context: { name: 'Gold' },
    });
    expect(sentence(e)).toBe('Super Admin updated price, name and 3 other fields on the plan Gold');
  });

  it('TC-AS-08 two changed fields are joined, never counted', () => {
    const e = entry({
      table: 'plans',
      changes: [change('price', 10, 12), change('duration_months', 1, 3)],
      context: { name: 'Gold', currency_id: USD.id },
    });
    expect(sentence(e)).toBe('Super Admin updated price and months covered on the plan Gold');
  });

  it('TC-AS-09 an active flag is spoken, not diffed', () => {
    const e = entry({
      table: 'users',
      changes: [change('active', true, false)],
      context: { full_name: 'Ali Hassan' },
    });
    expect(sentence(e)).toBe('Super Admin deactivated the staff member Ali Hassan');
  });

  it('TC-AS-10 reactivating a customer says reinstated, not "changed Active"', () => {
    const e = entry({
      table: 'customers',
      action: 'restore',
      subject: 'John Doe',
      changes: [change('active', false, true)],
    });
    expect(sentence(e)).toBe('Super Admin reinstated the customer John Doe');
  });

  it('TC-AS-11 editing the identity column reads as a rename, not "X from Y to X"', () => {
    const e = entry({
      table: 'plans',
      changes: [change('name', 'Silver', 'Gold')],
      context: { name: 'Gold' },
    });
    expect(sentence(e)).toBe('Super Admin renamed the plan Silver to Gold');
  });

  it('TC-AS-12 a write-off is its own statement, separate from a void', () => {
    const e = entry({
      table: 'charges',
      subject: 'John Doe',
      changes: [change('written_off_at', null, '2026-03-04T15:12:00.000Z')],
      context: { kind: 'month', billing_month: '2026-03-01' },
    });
    expect(sentence(e)).toBe('Super Admin wrote off the March 2026 bill for John Doe');
  });

  it('TC-AS-13 a password change never shows the value', () => {
    const e = entry({
      table: 'users',
      changes: [change('password', '***', '***changed***')],
      context: { full_name: 'Ali Hassan' },
    });
    expect(sentence(e)).toBe('Super Admin changed the password for the staff member Ali Hassan');
  });

  it('TC-AS-14 a skip is a create on skipped_months but reads as skipping a month', () => {
    const e = entry({
      table: 'skipped_months',
      action: 'create',
      subject: 'John Doe',
      snapshot: { billing_month: '2026-03-01', skipped: true },
      context: { billing_month: '2026-03-01', skipped: true },
    });
    expect(sentence(e)).toBe('Super Admin skipped March 2026 for John Doe');
  });

  it('TC-AS-15 an unskip is the restore action on the same table', () => {
    const e = entry({
      table: 'skipped_months',
      action: 'restore',
      subject: 'John Doe',
      context: { billing_month: '2026-03-01', skipped: false },
    });
    expect(sentence(e)).toBe('Super Admin removed the skip on March 2026 for John Doe');
  });

  it('TC-AS-16 a sale is named by its receipt number', () => {
    const e = entry({ table: 'sales', action: 'void', subject: 'John Doe', changes: [change('voided_at', null, 'x')] });
    expect(sentence(e)).toBe('Super Admin voided the #0AB12C sale for John Doe');
  });

  it('TC-AS-17 a stock entry is named by its product, which is the subject', () => {
    const e = entry({
      table: 'stock_movements',
      subject: 'Widget A',
      changes: [change('quantity_delta', 5, 8)],
    });
    expect(sentence(e)).toBe('Super Admin changed quantity on a stock entry from 5 to 8 for Widget A');
  });

  it('TC-AS-18 an old row names the TYPE, never its raw "·"-joined label', () => {
    const e = entry({
      table: 'plans',
      label: 'Gold · 10 · 1',
      changes: [change('duration_months', 1, 3)],
    });
    expect(sentence(e)).toBe('Super Admin changed months covered on a plan from 1 to 3');
    expect(sentence(e)).not.toContain('·');
  });

  it('TC-AS-22 an old bill void reads as "a bill", not a raw date and amount', () => {
    const e = entry({
      table: 'charges',
      action: 'void',
      subject: 'Donald Trump',
      label: '2026-07-01 · 50',
      changes: [change('voided_at', null, 'x')],
    });
    expect(sentence(e)).toBe('Super Admin voided a bill for Donald Trump');
  });

  it('TC-AS-23 an old payment void reads as "a payment", not a raw timestamp', () => {
    const e = entry({
      table: 'collections',
      action: 'void',
      subject: 'Donald Trump',
      label: '2026-09-01T18:31:00+00:00 · 30',
      changes: [change('voided_at', null, 'x')],
    });
    expect(sentence(e)).toBe('Super Admin voided a payment from Donald Trump');
  });

  it('TC-AS-24 cash is RECORDED, and named by its amount', () => {
    const e = entry({
      table: 'collections',
      action: 'create',
      subject: 'Donald Trump',
      snapshot: { amount: 20, currency_id: USD.id },
      context: { amount: 20, currency_id: USD.id },
    });
    expect(sentence(e)).toBe('Super Admin recorded a payment of 20.00 $ from Donald Trump');
  });

  it('TC-AS-25 voiding cash names the amount and says "from"', () => {
    const e = entry({
      table: 'collections',
      action: 'void',
      subject: 'Donald Trump',
      changes: [change('voided_at', null, 'x')],
      context: { amount: 30, currency_id: USD.id },
    });
    expect(sentence(e)).toBe('Super Admin voided a payment of 30.00 $ from Donald Trump');
  });

  it('TC-AS-26 a write-off names the month once the bill carries it', () => {
    const e = entry({
      table: 'charges',
      subject: 'Donald Trump',
      changes: [change('written_off_at', null, '2026-09-03T16:42:00.000Z')],
      context: { kind: 'month', billing_month: '2026-08-01' },
    });
    expect(sentence(e)).toBe('Super Admin wrote off the August 2026 bill for Donald Trump');
  });

  it('TC-AS-27 a new bill is "a new March 2026 bill", never "the"', () => {
    const e = entry({
      table: 'charges',
      action: 'create',
      subject: 'Donald Trump',
      snapshot: { kind: 'month', billing_month: '2026-03-01', amount: 50 },
    });
    expect(sentence(e)).toBe('Super Admin added a new March 2026 bill for Donald Trump');
  });

  it('TC-AS-29 money on a dead bill reads as re-opened, never as a void', () => {
    const e = entry({
      table: 'charges',
      subject: 'Donald Trump',
      changes: [
        change('voided_at', '2026-08-20T10:00:00.000Z', null),
        change('voided_by', 'u1', null),
        change('issued_at', '2026-08-01T10:00:00.000Z', '2026-09-01T21:33:00.000Z'),
      ],
      context: { kind: 'month', billing_month: '2026-09-01' },
    });
    expect(sentence(e)).toBe(
      'Super Admin re-opened the September 2026 bill for Donald Trump',
    );
  });

  it('TC-AS-30 a written-off bill taking money re-opens too', () => {
    const e = entry({
      table: 'charges',
      subject: 'Donald Trump',
      changes: [
        change('written_off_at', '2026-08-20T10:00:00.000Z', null),
        change('issued_at', '2026-08-01T10:00:00.000Z', '2026-09-01T21:33:00.000Z'),
      ],
      context: { kind: 'month', billing_month: '2026-09-01' },
    });
    expect(sentence(e)).toContain('re-opened the September 2026 bill');
  });

  it('TC-AS-31 a real void is still a void, not a re-open', () => {
    const e = entry({
      table: 'charges',
      action: 'void',
      subject: 'Donald Trump',
      changes: [change('voided_at', null, '2026-09-01T21:33:00.000Z')],
      context: { kind: 'month', billing_month: '2026-09-01' },
    });
    expect(sentence(e)).toBe('Super Admin voided the September 2026 bill for Donald Trump');
  });

  it('TC-AS-32 field names read as prose, never as table headings or raw columns', () => {
    const e = entry({
      table: 'charges',
      subject: 'Donald Trump',
      changes: [
        change('issued_at', 'a', 'b'),
        change('due_date', 'c', 'd'),
        change('notes', 'e', 'f'),
      ],
      context: { kind: 'month', billing_month: '2026-09-01' },
    });
    const s = sentence(e);
    expect(s).toContain('billed on, due date and 1 other field');
    expect(s).not.toContain('issued_at');
    expect(s).not.toContain('Voided at');
  });

  it('TC-AS-28 an unnamed record never reads "the X" or leaves a dangling article', () => {
    const e = entry({ table: 'plans', action: 'delete' });
    expect(sentence(e)).toBe('Super Admin deleted a plan');
  });

  it('TC-AS-19 an unknown actor is named, never left blank', () => {
    const e = entry({
      table: 'plans',
      actorUserId: null,
      actorUsername: null,
      changes: [change('duration_months', 1, 3)],
      context: { name: 'Gold' },
    });
    expect(sentence(e)).toBe('Someone changed months covered on the plan Gold from 1 to 3');
  });

  it('TC-AS-20 a timeline already headed by the customer drops the "for X" clause', () => {
    const e = entry({
      table: 'charges',
      action: 'void',
      subject: 'John Doe',
      changes: [change('voided_at', null, 'x')],
      context: { kind: 'month', billing_month: '2026-03-01' },
    });
    expect(sentence(e, false)).toBe('Super Admin voided the March 2026 bill');
  });

  it('TC-AS-21 a value cannot forge a bold marker of its own', () => {
    const e = entry({
      table: 'customers',
      action: 'create',
      snapshot: { name: 'John' },
      subject: 'John',
    });
    expect(bolded(e)).toEqual(['Super Admin', 'John']);
  });
  it('TC-AS-33 marking a customer as regular is spoken, not diffed', () => {
    const e = entry({
      table: 'customers',
      subject: 'John Doe',
      changes: [change('is_regular', false, true)],
      snapshot: { name: 'John Doe' },
    });
    expect(sentence(e)).toBe('Super Admin marked the customer John Doe as a regular customer');
  });

  it('TC-AS-34 clearing the regular mark reads as a removal', () => {
    const e = entry({
      table: 'customers',
      subject: 'John Doe',
      changes: [change('is_regular', true, false)],
      snapshot: { name: 'John Doe' },
    });
    expect(sentence(e)).toBe(
      'Super Admin removed the regular customer mark from the customer John Doe',
    );
  });

  it('TC-AS-35 a per-customer price flag reads as a verb', () => {
    const e = entry({
      table: 'plans',
      changes: [change('is_custom_price', false, true)],
      context: { name: 'Gold' },
    });
    expect(sentence(e)).toBe('Super Admin turned on a per-customer price for the plan Gold');
  });

  it('TC-AS-36 a tier upgrade names the new plan', () => {
    const e = entry({
      table: 'tenants',
      changes: [change('tier_id', 'old', 'new'), change('tier_upgraded_at', null, 'x')],
      context: { name: 'Acme' },
    });
    expect(sentence(e)).toBe('Super Admin moved the organization Acme to the new plan');
  });

  it('TC-AS-37 an unskip is read from the flag, not only from the action', () => {
    const e = entry({
      table: 'skipped_months',
      action: 'create',
      subject: 'John Doe',
      changes: [change('skipped', true, false)],
      context: { billing_month: '2026-03-01', skipped: false },
    });
    expect(sentence(e)).toBe('Super Admin removed the skip on March 2026 for John Doe');
  });

  it('TC-AS-38 no state column ever leaks as a bare "changed X from A to B"', () => {
    const spoken: Array<[AuditTable, string, unknown, unknown]> = [
      ['users', 'active', true, false],
      ['branches', 'active', true, false],
      ['currencies', 'active', false, true],
      ['products', 'active', true, false],
      ['services', 'active', false, true],
      ['customers', 'active', true, false],
      ['customers', 'is_regular', false, true],
      ['plans', 'is_custom_price', true, false],
      ['charges', 'written_off_at', null, 'x'],
      ['users', 'password', '***', '***changed***'],
      ['tenants', 'tier_id', 'a', 'b'],
    ];
    for (const [table, field, before, after] of spoken) {
      const e = entry({ table, changes: [change(field, before, after)], context: { name: 'X' } });
      expect(sentence(e)).not.toMatch(/ from .+ to /);
    }
  });
  it('TC-AS-39 voiding a sale payment says it was for a sale', () => {
    const e = entry({
      table: 'collections',
      action: 'void',
      subject: 'John Doe',
      changes: [change('voided_at', null, 'x')],
      context: { amount: 30, currency_id: USD.id, kind: 'sale' },
    });
    expect(sentence(e)).toBe('Super Admin voided a sale payment of 30.00 $ from John Doe');
  });

  it('TC-AS-40 a subscription payment names its own kind', () => {
    const e = entry({
      table: 'collections',
      action: 'create',
      subject: 'John Doe',
      context: { amount: 20, currency_id: USD.id, kind: 'month' },
    });
    expect(sentence(e)).toBe(
      'Super Admin recorded a subscription payment of 20.00 $ from John Doe',
    );
  });

  it('TC-AS-41 a debt payment reads as a debt payment', () => {
    const e = entry({
      table: 'collections',
      action: 'void',
      subject: 'John Doe',
      changes: [change('voided_at', null, 'x')],
      context: { amount: 15, currency_id: USD.id, kind: 'manual' },
    });
    expect(sentence(e)).toBe('Super Admin voided a debt payment of 15.00 $ from John Doe');
  });

  it('TC-AS-42 a hand-over settling several kinds stays the plain word', () => {
    const e = entry({
      table: 'collections',
      action: 'void',
      subject: 'John Doe',
      changes: [change('voided_at', null, 'x')],
      context: { amount: 50, currency_id: USD.id, kind: 'mixed' },
    });
    expect(sentence(e)).toBe('Super Admin voided a payment of 50.00 $ from John Doe');
  });

  it('TC-AS-43 an old payment row with no kind still reads', () => {
    const e = entry({
      table: 'collections',
      action: 'void',
      subject: 'John Doe',
      changes: [change('voided_at', null, 'x')],
      context: { amount: 30, currency_id: USD.id },
    });
    expect(sentence(e)).toBe('Super Admin voided a payment of 30.00 $ from John Doe');
  });
});
