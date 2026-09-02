import { resolveLinePrice } from '@/src/modules/customer/customer-plans/utils/linePrice';
import { plan } from '../helpers/factories';

// TC-LP-* — "what does this service line cost?". The amount, its currency and
// its span must always travel together: the currency is what freezes the bill's
// rate, and the span is what gives the amount its meaning (gotcha #85).

describe('resolveLinePrice', () => {
  it('TC-LP-01 a fixed-price plan gives the plan`s price and currency', () => {
    const p = plan({ price: 20, currencyId: 'cur-lbp', durationMonths: 1 });
    expect(resolveLinePrice({ customPrice: null, customCurrencyId: null, plan: p })).toEqual({
      amount: 20, currencyId: 'cur-lbp', durationMonths: 1, isFixed: true, kind: 'plan',
    });
  });

  it('TC-LP-02 a special price REPLACES the plan`s, with its own currency', () => {
    const p = plan({ price: 20, currencyId: null, durationMonths: 1 });
    expect(resolveLinePrice({ customPrice: 15, customCurrencyId: 'cur-lbp', plan: p })).toEqual({
      amount: 15, currencyId: 'cur-lbp', durationMonths: 1, isFixed: true, kind: 'special',
    });
  });

  it('TC-LP-03 a special price on a 3-month plan is "100 per 3 months", never 100 a month', () => {
    const p = plan({ price: 60, durationMonths: 3 });
    const price = resolveLinePrice({ customPrice: 100, customCurrencyId: null, plan: p });
    expect(price.amount).toBe(100);
    expect(price.durationMonths).toBe(3);
  });

  it('TC-LP-04 a custom-price plan has nothing to charge without someone typing it', () => {
    const p = plan({ isCustomPrice: true, price: 0 });
    const price = resolveLinePrice({ customPrice: null, customCurrencyId: null, plan: p });
    expect(price).toEqual({
      amount: null, currencyId: null, durationMonths: 1, isFixed: false, kind: 'typed',
    });
  });

  it('TC-LP-05 no plan at all -> typed, one month', () => {
    const price = resolveLinePrice({ customPrice: null, customCurrencyId: null, plan: null });
    expect(price.isFixed).toBe(false);
    expect(price.durationMonths).toBe(1);
  });

  it('TC-LP-06 a special price makes an otherwise type-it line quick-payable', () => {
    const p = plan({ isCustomPrice: true, price: 0, durationMonths: 1 });
    expect(resolveLinePrice({ customPrice: 12, customCurrencyId: null, plan: p }).isFixed)
      .toBe(true);
  });

  it('TC-LP-07 a zero special price is still a fixed price of zero, not "typed"', () => {
    const price = resolveLinePrice({ customPrice: 0, customCurrencyId: null, plan: plan() });
    expect(price.kind).toBe('special');
    expect(price.amount).toBe(0);
  });

  it('TC-LP-08 REGRESSION: an UNDEFINED customPrice must behave like null', () => {
    // `line.customPrice !== null` is true for undefined too, which would return
    // isFixed with amount undefined — a quick-payable line with no amount.
    const price = resolveLinePrice({
      customPrice: undefined as unknown as null,
      customCurrencyId: null,
      plan: plan({ price: 20 }),
    });
    expect(price.amount).toBe(20);
    expect(price.kind).toBe('plan');
  });
});
