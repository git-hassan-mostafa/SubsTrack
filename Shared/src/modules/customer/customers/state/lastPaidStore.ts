import { create } from "zustand";
import { collectionService } from "@shared/modules/ledger/services/CollectionService";
import { currentDataEpoch, isStaleEpoch } from "@shared/shared/lib/dataEpoch";

interface LastPaidState {
  byCustomer: Map<string, string>;
  loaded: boolean;
  fetchLastPaid: () => Promise<void>;
  reset: () => void;
}

// The phone list's "last paid" filter; the web reads the same fact on the server.
export const useLastPaidStore = create<LastPaidState>()((set) => ({
  byCustomer: new Map(),
  loaded: false,

  fetchLastPaid: async () => {
    const epoch = currentDataEpoch();
    try {
      const byCustomer = await collectionService.getLastPaidByCustomer();
      if (isStaleEpoch(epoch)) return;
      set({ byCustomer, loaded: true });
    } catch {}
  },

  reset: () => set({ byCustomer: new Map(), loaded: false }),
}));
