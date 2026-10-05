import type { Service } from "@shared/core/types";
import {
  canSaveCatalogItem,
  catalogItemDraftOf,
  catalogItemInput,
  type CatalogItemDraft,
} from "@shared/core/utils/catalogItemDraft";
import type { ServiceInput } from "@shared/modules/admin/service-catalog/utils/types";

export type ServiceDraft = CatalogItemDraft;

export function serviceDraftOf(service: Service | null, newBranchId: string | null): ServiceDraft {
  return catalogItemDraftOf(service, newBranchId);
}

export const canSaveService = canSaveCatalogItem;

export function serviceInput(draft: ServiceDraft): ServiceInput {
  return catalogItemInput(draft);
}
