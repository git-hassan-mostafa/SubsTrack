import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CollectionListItem } from "@shared/core/types";
import { collectionService } from "@shared/modules/ledger/services/CollectionService";

export interface CollectionDetail {
  collection: CollectionListItem | null;
  error: string | null;
}

// One hand-over in full; `initial` paints at once while the fresh copy loads.
export function useCollectionDetail(
  collectionId: string,
  initial: CollectionListItem | null = null,
): CollectionDetail {
  const { t } = useTranslation();
  const [collection, setCollection] = useState<CollectionListItem | null>(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    collectionService.getListItem(collectionId).then(
      (next) => {
        if (!current) return;
        if (next) setCollection(next);
        else setError(t("errors.collection_not_found"));
      },
      (e: unknown) => {
        if (current) setError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      current = false;
    };
  }, [collectionId, t]);

  return { collection, error };
}
