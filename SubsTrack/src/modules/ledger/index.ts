// The money model: charges (what is owed) + collections (money handed over) +
// collection_items (which bill that money paid). See docs/features.md → Ledger.

export { chargeService } from './services/ChargeService';
export { collectionService } from './services/CollectionService';
export { ledgerService } from './services/LedgerService';

export { allocate, allocateExcluding, keyOf, sortByDue, totalOwed } from './utils/waterfall';
export type { AllocationResult } from './utils/waterfall';
export { billForMonth, chargeLabel, isDebtItem, openItemFromCharge, virtualMonthItem } from './utils/openItems';
export {
  mapDbChargeToCharge,
  mapDbCollectionToCollection,
  mapDbCollectionItemToCollectionItem,
} from './utils/mapper';

export type { CreateManualChargeInput } from './services/ChargeService';
export type { CollectInput } from './services/CollectionService';
export type { IChargeRepository } from './repository/IChargeRepository';
export type { ICollectionRepository } from './repository/ICollectionRepository';
