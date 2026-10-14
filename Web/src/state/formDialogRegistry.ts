import { create } from "zustand";

export interface FormDialogEntry {
  dirty: boolean;
  onClose: () => void;
}

interface FormDialogRegistryState {
  dialogs: Record<string, FormDialogEntry>;
  register: (id: string, entry: FormDialogEntry) => void;
  unregister: (id: string) => void;
  reset: () => void;
}

// tracks open dialogs so app-level navigation blocking sees any unsaved changes
export const useFormDialogRegistry = create<FormDialogRegistryState>((set) => ({
  dialogs: {},
  register: (id, entry) =>
    set((state) => ({
      dialogs: { ...state.dialogs, [id]: entry },
    })),
  unregister: (id) =>
    set((state) => {
      const next = { ...state.dialogs };
      delete next[id];
      return { dialogs: next };
    }),
  reset: () => set({ dialogs: {} }),
}));
