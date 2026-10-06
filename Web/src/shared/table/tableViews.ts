import { useCallback, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { GridColumnVisibilityModel, GridDensity } from "@mui/x-data-grid";
import { runtimeStorage } from "@shared/core/runtime/runtimeStorage";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";

const TABLE_VIEWS_STORE_KEY = "web-table-views";

export interface TableView {
  widths: Readonly<Record<string, number>>;
  hidden: GridColumnVisibilityModel;
}

export const EMPTY_VIEW: TableView = { widths: {}, hidden: {} };

interface TableViewsState {
  densityByUser: Readonly<Record<string, GridDensity>>;
  views: Readonly<Record<string, TableView>>;
  setDensity: (userId: string, density: GridDensity) => void;
  updateView: (viewId: string, change: (view: TableView) => TableView) => void;
}

// Each person's own layout, kept in this browser across logins; never tenant data, so logout keeps it.
const useTableViews = create<TableViewsState>()(
  persist(
    (set) => ({
      densityByUser: {},
      views: {},
      setDensity: (userId, density) =>
        set((state) => ({ densityByUser: { ...state.densityByUser, [userId]: density } })),
      updateView: (viewId, change) =>
        set((state) => ({ views: { ...state.views, [viewId]: change(state.views[viewId] ?? EMPTY_VIEW) } })),
    }),
    {
      name: TABLE_VIEWS_STORE_KEY,
      storage: createJSONStorage(() => runtimeStorage),
      partialize: (state) => ({ densityByUser: state.densityByUser, views: state.views }),
    },
  ),
);

function useUserId(): string {
  return useAuth().user?.id ?? "";
}

export function useTableDensity() {
  const userId = useUserId();
  const density = useTableViews((s) => s.densityByUser[userId] ?? "standard");
  const setDensity = useCallback(
    (next: GridDensity) => useTableViews.getState().setDensity(userId, next),
    [userId],
  );
  return { density, setDensity };
}

// No `viewKey` (dialog tables) → the layout lives only as long as the table is open.
export function useTableView(viewKey: string | null) {
  const userId = useUserId();
  const viewId = viewKey === null ? null : `${userId}:${viewKey}`;
  const savedView = useTableViews((s) => (viewId === null ? undefined : s.views[viewId]));
  const [openView, setOpenView] = useState<TableView>(EMPTY_VIEW);

  const updateView = useCallback(
    (change: (view: TableView) => TableView) => {
      if (viewId === null) setOpenView(change);
      else useTableViews.getState().updateView(viewId, change);
    },
    [viewId],
  );

  return { view: viewId === null ? openView : (savedView ?? EMPTY_VIEW), updateView };
}
