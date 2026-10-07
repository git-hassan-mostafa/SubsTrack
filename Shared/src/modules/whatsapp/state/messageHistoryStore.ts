import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { WhatsAppMessage, WhatsAppMessageStatus } from "@shared/core/types";
import { whatsAppService } from "@shared/modules/whatsapp/services/WhatsAppService";
import { HISTORY_PAGE_SIZE } from "@shared/modules/whatsapp/utils/constants";
import { getStore } from "@shared/state/globalStore";
import { currentDataEpoch, isStaleEpoch } from "@shared/shared/lib/dataEpoch";

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
        const page = await whatsAppService.getMessagePage(tenant, {
          status: get().status,
          branch: null,
          offset: 0,
          limit: HISTORY_PAGE_SIZE,
        });
        if (isStaleEpoch(epoch)) return;
        set((s) => {
          s.items = page.rows;
          s.hasMore = page.rows.length < page.total;
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
        const page = await whatsAppService.getMessagePage(tenant, {
          status,
          branch: null,
          offset: items.length,
          limit: HISTORY_PAGE_SIZE,
        });
        if (isStaleEpoch(epoch)) return;
        set((s) => {
          s.items.push(...page.rows);
          s.hasMore = s.items.length < page.total;
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
