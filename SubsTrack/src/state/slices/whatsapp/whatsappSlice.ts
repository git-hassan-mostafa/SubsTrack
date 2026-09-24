import type { StateCreator } from "zustand";
import type {
  WhatsAppAccount,
  WhatsAppLanguage,
  WhatsAppOptOut,
  WhatsAppQueueResult,
  WhatsAppSkipReason,
  WhatsAppTemplate,
} from "@/src/core/types";
import {
  whatsAppService,
  type RecipientBuildArgs,
} from "@/src/modules/whatsapp/services/WhatsAppService";
import type { GlobalState } from "@/src/state/globalStore";
import { currentDataEpoch, isStaleEpoch } from "@/src/shared/lib/dataEpoch";

export interface WhatsAppSendOutcome {
  result: WhatsAppQueueResult;
  localSkipped: WhatsAppQueueResult["skipped"];
}

export interface WhatsAppSlice {
  account: WhatsAppAccount | null;
  templates: WhatsAppTemplate[];
  optOuts: WhatsAppOptOut[];
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  sending: boolean;
  error: string | null;
  fetchOverview: () => Promise<void>;
  ensureLoaded: () => Promise<void>;
  startConnect: (consent: boolean) => Promise<string | null>;
  refresh: () => Promise<void>;
  submitTemplates: () => Promise<void>;
  disconnect: () => Promise<boolean>;
  setOptOut: (customerId: string, optedOut: boolean) => Promise<boolean>;
  send: (args: {
    template: WhatsAppTemplate;
    force: boolean;
    build: RecipientBuildArgs;
  }) => Promise<WhatsAppSendOutcome | null>;
  reminderFallbackText: (
    build: Omit<RecipientBuildArgs, "choices">,
    language: WhatsAppLanguage,
  ) => Promise<{ text: string | null; reason: WhatsAppSkipReason | null } | null>;
  clearError: () => void;
  reset: () => void;
}

export const createWhatsAppSlice: StateCreator<
  GlobalState,
  [["zustand/immer", never]],
  [],
  WhatsAppSlice
> = (set, get) => {
  const run = async <T>(
    flag: "saving" | "sending",
    call: () => Promise<T>,
  ): Promise<T | null> => {
    set((state) => {
      state.whatsapp[flag] = true;
      state.whatsapp.error = null;
    });
    try {
      const value = await call();
      set((state) => {
        state.whatsapp[flag] = false;
      });
      return value;
    } catch (e) {
      set((state) => {
        state.whatsapp.error = (e as Error).message;
        state.whatsapp[flag] = false;
      });
      return null;
    }
  };

  return {
    account: null,
    templates: [],
    optOuts: [],
    loaded: false,
    loading: false,
    saving: false,
    sending: false,
    error: null,

    fetchOverview: async () => {
      const tenant = get().auth.user?.tenant;
      if (!tenant?.whatsappEnabled) return;
      const epoch = currentDataEpoch();
      set((state) => {
        state.whatsapp.loading = true;
        state.whatsapp.error = null;
      });
      try {
        const overview = await whatsAppService.getOverview(tenant.id);
        if (isStaleEpoch(epoch)) return;
        set((state) => {
          state.whatsapp.account = overview.account;
          state.whatsapp.templates = overview.templates;
          state.whatsapp.optOuts = overview.optOuts;
          state.whatsapp.loaded = true;
          state.whatsapp.loading = false;
        });
      } catch (e) {
        if (isStaleEpoch(epoch)) return;
        set((state) => {
          state.whatsapp.error = (e as Error).message;
          state.whatsapp.loading = false;
        });
      }
    },

    ensureLoaded: async () => {
      const { loaded, loading } = get().whatsapp;
      if (loaded || loading) return;
      await get().whatsapp.fetchOverview();
    },

    startConnect: (consent) =>
      run("saving", () => whatsAppService.startConnect(consent)),

    refresh: async () => {
      const done = await run("saving", async () => {
        await whatsAppService.refresh();
        return true;
      });
      if (done) await get().whatsapp.fetchOverview();
    },

    submitTemplates: async () => {
      const done = await run("saving", async () => {
        await whatsAppService.submitTemplates();
        return true;
      });
      if (done) await get().whatsapp.fetchOverview();
    },

    disconnect: async () => {
      const done = await run("saving", async () => {
        await whatsAppService.disconnect();
        return true;
      });
      if (!done) return false;
      set((state) => {
        state.whatsapp.account = null;
        state.whatsapp.templates = [];
      });
      return true;
    },

    setOptOut: async (customerId, optedOut) => {
      const done = await run("saving", async () => {
        await whatsAppService.setOptOut(customerId, optedOut);
        return true;
      });
      if (!done) return false;
      set((state) => {
        state.whatsapp.optOuts = optedOut
          ? [
              ...state.whatsapp.optOuts.filter((o) => o.customerId !== customerId),
              {
                id: `local:${customerId}`,
                customerId,
                phoneE164: "",
                source: "admin",
                createdAt: new Date().toISOString(),
              },
            ]
          : state.whatsapp.optOuts.filter((o) => o.customerId !== customerId);
      });
      return true;
    },

    send: ({ template, force, build }) =>
      run("sending", async () => {
        const { recipients, skipped } =
          await whatsAppService.buildRecipients(build);
        const result =
          recipients.length > 0
            ? await whatsAppService.queue(template, recipients, force)
            : { batchId: "", queued: 0, skipped: [] };
        return { result, localSkipped: skipped };
      }),

    reminderFallbackText: (build, language) =>
      run("sending", () =>
        whatsAppService.reminderFallbackText(build, language),
      ),

    clearError: () =>
      set((state) => {
        state.whatsapp.error = null;
      }),

    reset: () =>
      set((state) => {
        state.whatsapp.account = null;
        state.whatsapp.templates = [];
        state.whatsapp.optOuts = [];
        state.whatsapp.loaded = false;
        state.whatsapp.loading = false;
        state.whatsapp.saving = false;
        state.whatsapp.sending = false;
        state.whatsapp.error = null;
      }),
  };
};
