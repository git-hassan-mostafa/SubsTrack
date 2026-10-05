import { useMemo, useState } from "react";
import { DEFAULT_PAGE_SIZE } from "@/state/createPagedStore";

// DataTable paging over rows in memory; a shorter list snaps to its last page.
export function useRowsPage<T>(all: T[]) {
  const [paging, setPaging] = useState({ page: 0, pageSize: DEFAULT_PAGE_SIZE });
  const lastPage = Math.max(0, Math.ceil(all.length / paging.pageSize) - 1);
  const page = Math.min(paging.page, lastPage);
  const pageSize = paging.pageSize;

  const rows = useMemo(
    () => all.slice(page * pageSize, (page + 1) * pageSize),
    [all, page, pageSize],
  );

  return {
    rows,
    total: all.length,
    page,
    pageSize,
    onPageChange: (next: number, nextSize: number) =>
      setPaging({ page: nextSize === pageSize ? next : 0, pageSize: nextSize }),
    toFirstPage: () => setPaging((current) => ({ ...current, page: 0 })),
  };
}
