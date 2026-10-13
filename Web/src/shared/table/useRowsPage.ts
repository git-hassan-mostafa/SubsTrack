import { useMemo, useState } from "react";
import { DEFAULT_PAGE_SIZE } from "@/state/createPagedStore";
import { useSavedPageSize } from "./tableViews";

// DataTable paging over rows in memory; a shorter list snaps to its last page.
export function useRowsPage<T>(all: T[], viewKey: string) {
  const { savedPageSize, savePageSize } = useSavedPageSize(viewKey);
  const [requestedPage, setRequestedPage] = useState(0);
  const pageSize = savedPageSize ?? DEFAULT_PAGE_SIZE;
  const lastPage = Math.max(0, Math.ceil(all.length / pageSize) - 1);
  const page = Math.min(requestedPage, lastPage);

  const rows = useMemo(
    () => all.slice(page * pageSize, (page + 1) * pageSize),
    [all, page, pageSize],
  );

  return {
    viewKey,
    rows,
    total: all.length,
    page,
    pageSize,
    onPageChange: (next: number, nextSize: number) => {
      setRequestedPage(nextSize === pageSize ? next : 0);
      if (nextSize !== pageSize) savePageSize(nextSize);
    },
    toFirstPage: () => setRequestedPage(0),
  };
}
