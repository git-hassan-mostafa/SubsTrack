import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { WhatsAppMessage, WhatsAppMessageStatus } from "@/src/core/types";
import { whatsAppService } from "@/src/modules/whatsapp/services/WhatsAppService";
import { HISTORY_PAGE_SIZE } from "@/src/modules/whatsapp/utils/constants";
import { getStore } from "@/src/state/globalStore";
import { currentDataEpoch, isStaleEpoch } from "@/src/shared/lib/dataEpoch";

export interface MessageHistoryState {
  items: WhatsAppMessage[];
  status: WhatsAppMessageStatus | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  fetchMessages: () => Promise<void>;
  loadMore: () => Promise<void>;
  setStatus: (status: WhatsAppMessageStatus | null) => Promise<void>;
  cancelBatch: (batchId: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

function tenantId(): string | null {
  return getStore().getState().auth.user?.tenantId ?? null;
}

export const useMessageHistoryStore = create<MessageHistoryState>()(
  immer((set, get) => ({
    items: [],
    status: null,
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: null,

    fetchMessages: async () => {
      const tenant = tenantId();
      if (!tenant) return;
      const epoch = currentDataEpoch();
      set((s) => {
        s.loading = true;
        s.error = null;
      });
      try {
        const items = await whatsAppService.getMessages(
          tenant,
          get().status,
          0,
          HISTORY_PAGE_SIZE,
        );
        if (isStaleEpoch(epoch)) return;
        set((s) => {
          s.items = items;
          s.hasMore = items.length === HISTORY_PAGE_SIZE;
          s.loading = false;
        });
      } catch (e) {
        if (isStaleEpoch(epoch)) return;
        set((s) => {
          s.error = (e as Error).message;
          s.loading = false;
        });
      }
    },

    loadMore: async () => {
      const tenant = tenantId();
      const { hasMore, loading, loadingMore, items, status } = get();
      if (!tenant || !hasMore || loading || loadingMore) return;
      const epoch = currentDataEpoch();
      set((s) => {
        s.loadingMore = true;
      });
      try {
        const page = await whatsAppService.getMessages(
          tenant,
          status,
          items.length,
          HISTORY_PAGE_SIZE,
        );
        if (isStaleEpoch(epoch)) return;
        set((s) => {
          s.items.push(...page);
          s.hasMore = page.length === HISTORY_PAGE_SIZE;
          s.loadingMore = false;
        });
      } catch (e) {
        if (isStaleEpoch(epoch)) return;
        set((s) => {
          s.error = (e as Error).message;
          s.loadingMore = false;
        });
      }
    },

    setStatus: async (status) => {
      set((s) => {
        s.status = status;
      });
      await get().fetchMessages();
    },

    cancelBatch: async (batchId) => {
      try {
        await whatsAppService.cancelBatch(batchId);
        set((s) => {
          for (const item of s.items) {
            if (item.batchId === batchId && item.status === "queued") {
              item.status = "cancelled";
              item.errorKey = "cancelled_by_admin";
            }
          }
        });
      } catch (e) {
        set((s) => {
          s.error = (e as Error).message;
        });
      }
    },

    clearError: () =>
      set((s) => {
        s.error = null;
      }),

    reset: () =>
      set((s) => {
        s.items = [];
        s.status = null;
        s.loading = false;
        s.loadingMore = false;
        s.hasMore = false;
        s.error = null;
      }),
  })),
);
