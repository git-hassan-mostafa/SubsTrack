import type { Repositories } from "@shared/core/runtime/repositories";

const FAKES: Partial<Record<keyof Repositories, () => unknown>> = {
  charge: () => require("./fakeLedger").fakeChargeRepository,
  collection: () => require("./fakeLedger").fakeCollectionRepository,
  sale: () => require("./fakeSales").fakeSaleRepository,
  priceHistory: () => require("./fakePriceHistory").fakePriceHistoryRepository,
  plan: () => require("./fakePriceHistory").fakePlanRepository,
};

// Required lazily so the setup file loads nothing a suite may jest.mock later.
export const fakeRepositories = new Proxy({} as Repositories, {
  get(_target, key) {
    const fake = FAKES[key as keyof Repositories];
    if (!fake) {
      throw new Error(`repositories().${String(key)} is not faked in tests`);
    }
    return fake();
  },
});
