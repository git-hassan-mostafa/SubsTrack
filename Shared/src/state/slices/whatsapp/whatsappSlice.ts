import type { StateCreator } from "zustand";
import type {
  OwnAppConnectResult,
  WhatsAppAccount,
  WhatsAppLanguage,
  WhatsAppOptOut,
  WhatsAppQueueResult,
  WhatsAppSkipReason,
  WhatsAppTemplate,
  WhatsAppWebhookInfo,
} from "@shared/core/types";
import {
  whatsAppService,
  type RecipientBuildArgs,
  type ReminderPurpose,
} from "@shared/modules/whatsapp/services/WhatsAppService";
import type { OwnAppConnectInput } from "@shared/modules/whatsapp/repository/IWhatsAppRepository";
import type { GlobalState } from "@shared/state/globalStore";
import { currentDataEpoch, isStaleEpoch } from "@shared/shared/lib/dataEpoch";

export interface WhatsAppSendOutcome {
  result: WhatsAppQueueResult;
  localSkipped: WhatsAppQueueResult["skipped"];
}

export interface WhatsAppSlice {
  account: WhatsAppAccount | null;
  templates: WhatsAppTemplate[];
  optOuts: WhatsAppOptOut[];
  webhookInfo: WhatsAppWebhookInfo | null;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  sending: boolean;
  error: string | null;
  fetchOverview: () => Promise<void>;
  ensureLoaded: () => Promise<void>;
  startConnect: (consent: boolean) => Promise<string | null>;
  connectOwnApp: (input: OwnAppConnectInput) => Promise<OwnAppConnectResult | null>;
  loadWebhookInfo: () => Promise<void>;
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
    purpose: ReminderPurpose,
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
    webhookInfo: null,
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

    connectOwnApp: async (input) => {
      const result = await run("saving", () => whatsAppService.connectOwnApp(input));
      if (result?.status === "connected") {
        set((state) => {
          state.whatsapp.webhookInfo = null;
        });
        await get().whatsapp.fetchOverview();
      }
      return result;
    },

    loadWebhookInfo: async () => {
      const info = await run("saving", () => whatsAppService.webhookInfo());
      if (!info) return;
      set((state) => {
        state.whatsapp.webhookInfo = info;
      });
    },

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
        state.whatsapp.webhookInfo = null;
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

    reminderFallbackText: (build, language, purpose) =>
      run("sending", () =>
        whatsAppService.reminderFallbackText(build, language, purpose),
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
        state.whatsapp.webhookInfo = null;
        state.whatsapp.loaded = false;
        state.whatsapp.loading = false;
        state.whatsapp.saving = false;
        state.whatsapp.sending = false;
        state.whatsapp.error = null;
      }),
  };
};
