import { useCallback } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { GridColumnVisibilityModel, GridDensity } from "@mui/x-data-grid";
import { runtimeStorage } from "@shared/core/runtime/runtimeStorage";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";

const TABLE_VIEWS_STORE_KEY = "web-table-views";

export interface TableView {
  widths: Readonly<Record<string, number>>;
  hidden: GridColumnVisibilityModel;
  pageSize?: number;
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

export function useTableView(viewKey: string) {
  const viewId = `${useUserId()}:${viewKey}`;
  const savedView = useTableViews((s) => s.views[viewId]);

  const updateView = useCallback(
    (change: (view: TableView) => TableView) => useTableViews.getState().updateView(viewId, change),
    [viewId],
  );

  return { view: savedView ?? EMPTY_VIEW, updateView };
}

export function useSavedPageSize(viewKey: string) {
  const { view, updateView } = useTableView(viewKey);
  const savePageSize = useCallback(
    (pageSize: number) => updateView((held) => ({ ...held, pageSize })),
    [updateView],
  );
  return { savedPageSize: view.pageSize, savePageSize };
}
