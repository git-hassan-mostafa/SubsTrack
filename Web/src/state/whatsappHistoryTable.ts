import type { PageWindow, WhatsAppMessage, WhatsAppMessageStatus } from "@shared/core/types";
import { whatsAppService } from "@shared/modules/whatsapp/services/WhatsAppService";
import { getStore } from "@shared/state/globalStore";
import { createPagedStore, type PagedQuery } from "./createPagedStore";

export interface WhatsAppHistoryFilters {
  status: WhatsAppMessageStatus | null;
}

const NO_HISTORY_FILTER: WhatsAppHistoryFilters = { status: null };

function readMessagePage(query: PagedQuery<WhatsAppHistoryFilters>, window: PageWindow) {
  const tenantId = getStore().getState().auth.user?.tenantId;
  if (!tenantId) return Promise.resolve({ rows: [], total: 0 });
  return whatsAppService.getMessagePage(tenantId, {
    status: query.filters.status,
    branch: query.branch,
    ...window,
  });
}

// Meta moves a message's status in the background, so opening re-reads.
export const useWhatsAppHistoryTable = createPagedStore<WhatsAppMessage, WhatsAppHistoryFilters>(
  readMessagePage,
  NO_HISTORY_FILTER,
  { rereadOnOpen: true },
);
