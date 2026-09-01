// The money model: charges (what is owed) + collections (money handed over) +
// collection_items (which bill that money paid). See docs/features.md → Ledger.

export { chargeService } from './services/ChargeService';
export { collectionService } from './services/CollectionService';
export { ledgerService } from './services/LedgerService';

export { allocate, allocateExcluding, keyOf, sortByDue, totalOwed } from './utils/waterfall';
export type { AllocationResult } from './utils/waterfall';
export {
  billForMonth,
  chargeLabel,
  isDebtItem,
  monthItemFromEntry,
  openItemFromCharge,
  virtualMonthItem,
} from './utils/openItems';
export {
  mapDbChargeToCharge,
  mapDbCollectionToCollection,
  mapDbCollectionItemToCollectionItem,
} from './utils/mapper';

export type { CreateManualChargeInput } from './services/ChargeService';
export type { CollectInput } from './services/CollectionService';
export type { IChargeRepository } from './repository/IChargeRepository';
export type { ICollectionRepository } from './repository/ICollectionRepository';

export { CollectSheet } from './components/CollectSheet';
export { useCollectSheet } from './hooks/useCollectSheet';
export { useOwedChanged } from './hooks/useOwedChanged';
export { CollectQuickActionSheet } from './components/CollectQuickActionSheet';
export { BillSheet } from './components/BillSheet';
export { BillPaymentsList } from './components/BillPaymentsList';
export { CollectionCard } from './components/CollectionCard';
export { CollectionItemCard } from './components/CollectionItemCard';
export { CollectionSplitSheet } from './components/CollectionSplitSheet';
export { useOpenBill } from './hooks/useOpenBill';
export type { OpenBill } from './hooks/useOpenBill';
export { CollectionsPanel } from './screens/CollectionsPanel';
export { CollectionsHistorySheet } from './components/CollectionsHistorySheet';
export { VoidCollectionDialog } from './components/VoidCollectionDialog';
export { AmountCollectedSection } from './components/AmountCollectedSection';
export type { PaymentMode } from './components/AmountCollectedSection';
