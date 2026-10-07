import type {
  Customer,
  WhatsAppAccount,
  WhatsAppLanguage,
  WhatsAppMessage,
  WhatsAppMessageStatus,
  WhatsAppQueueResult,
  WhatsAppSkipReason,
  WhatsAppTemplate,
} from "@shared/core/types";
import type { ConfirmOptions } from "@shared/shared/lib/confirmStore";
import type { Tone } from "@shared/shared/lib/tone";
import { tierLimit } from "@edge/whatsapp/rules";
import { sijilTemplateByName } from "@edge/whatsapp/sijilTemplates";
import type { HistoryStatusFilter } from "./constants";

type TFn = (key: string, options?: Record<string, unknown>) => string;

export type WhatsAppSkipList = WhatsAppQueueResult["skipped"];

export interface TemplateWarning {
  text: string;
  tone: Tone;
}

export interface WhatsAppInfoRow {
  label: string;
  value: string | null;
}

const MESSAGE_STATUS_TONES: Record<WhatsAppMessageStatus, Tone> = {
  queued: "gray",
  sending: "gray",
  unknown: "orange",
  accepted: "sky",
  sent: "sky",
  delivered: "indigo",
  read: "emerald",
  failed: "red",
  cancelled: "gray",
};

const TEMPLATE_STATUS_TONES: Record<string, Tone> = {
  APPROVED: "emerald",
  PENDING: "amber",
  IN_APPEAL: "amber",
  REJECTED: "red",
  DISABLED: "red",
  PAUSED: "orange",
  FLAGGED: "orange",
};

export function messageStatusTone(status: WhatsAppMessageStatus): Tone {
  return MESSAGE_STATUS_TONES[status] ?? "gray";
}

export function templateStatusTone(status: string): Tone {
  return TEMPLATE_STATUS_TONES[status] ?? "gray";
}

export function accountStatusTone(account: WhatsAppAccount): Tone {
  return account.status === "connected" ? "emerald" : "amber";
}

export function messageStatusLabel(status: WhatsAppMessageStatus, t: TFn): string {
  return t(`whatsapp.message_status.${status}`);
}

export function historyFilterLabel(filter: HistoryStatusFilter, t: TFn): string {
  return filter === "all" ? t("whatsapp.filter_all") : messageStatusLabel(filter, t);
}

// A Sijil template reads as its purpose; the tenant's own as its Meta name.
export function messageTitle(message: WhatsAppMessage, t: TFn): string {
  const sijil = sijilTemplateByName(message.templateName);
  return sijil ? t(`whatsapp.purpose.${sijil.purpose}`) : message.templateName;
}

export function messageCustomerName(message: WhatsAppMessage, t: TFn): string {
  return message.customerName ?? t("whatsapp.unknown_customer");
}

export function messageErrorText(message: WhatsAppMessage, t: TFn): string | null {
  if (!message.errorKey) return null;
  return t(`whatsapp.message_error.${message.errorKey}`, {
    defaultValue: message.errorTitle ?? t("whatsapp.message_error.meta_error"),
  });
}

export function templateStatusLabel(template: WhatsAppTemplate, t: TFn): string {
  return t(`whatsapp.template_status.${template.status}`, { defaultValue: template.status });
}

export function templateMetaText(template: WhatsAppTemplate, t: TFn): string {
  return [
    template.language.toUpperCase(),
    template.category,
    template.supported ? null : t("whatsapp.template_not_supported"),
  ]
    .filter(Boolean)
    .join(" · ");
}

// Meta re-classing a Sijil template as marketing makes every send cost more.
export function templateWarnings(template: WhatsAppTemplate, t: TFn): TemplateWarning[] {
  const warnings: TemplateWarning[] = [];
  if (template.rejectionReason) {
    warnings.push({
      text: t("whatsapp.rejection_reason", { reason: template.rejectionReason }),
      tone: "red",
    });
  }
  if (template.isSijil && template.category === "MARKETING") {
    warnings.push({ text: t("whatsapp.marketing_warning"), tone: "amber" });
  }
  return warnings;
}

export function accountAttentionText(account: WhatsAppAccount, t: TFn): string | null {
  if (account.status !== "needs_attention") return null;
  return t(`whatsapp.attention.${account.attentionCode}`, {
    defaultValue: t("whatsapp.attention.default"),
  });
}

export function accountInfoRows(account: WhatsAppAccount, t: TFn): WhatsAppInfoRow[] {
  const limit = tierLimit(account.messagingLimitTier);
  return [
    { label: t("whatsapp.number"), value: account.displayPhoneNumber },
    { label: t("whatsapp.display_name"), value: account.verifiedName },
    {
      label: t("whatsapp.quality"),
      value: account.qualityRating
        ? t(`whatsapp.quality_rating.${account.qualityRating}`, { defaultValue: account.qualityRating })
        : null,
    },
    {
      label: t("whatsapp.daily_limit"),
      value: Number.isFinite(limit)
        ? t("whatsapp.daily_limit_value", { count: limit })
        : t("whatsapp.daily_limit_unlimited"),
    },
  ];
}

export function skipReasonCounts(skipped: WhatsAppSkipList): [WhatsAppSkipReason, number][] {
  const counts = new Map<WhatsAppSkipReason, number>();
  for (const { reason } of skipped) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts.entries()];
}

export function skipReasonText(reason: WhatsAppSkipReason, count: number, t: TFn): string {
  return t(`whatsapp.skip.${reason}`, { count });
}

// Only a 24-hour skip can be overridden; every other skip is a hard no.
export function recentlySentCustomers(
  skipped: WhatsAppSkipList,
  customers: readonly Customer[],
): Customer[] {
  const recent = new Set(
    skipped.filter((s) => s.reason === "recently_sent").map((s) => s.customerId),
  );
  return customers.filter((c) => recent.has(c.id));
}

export function cancelBatchConfirm(t: TFn): ConfirmOptions {
  return {
    title: t("whatsapp.cancel_batch"),
    message: t("whatsapp.cancel_batch_confirm"),
    confirmLabel: t("whatsapp.cancel_batch"),
    destructive: true,
  };
}

const LANGUAGES: WhatsAppLanguage[] = ["en", "ar"];

export function whatsAppLanguageOptions(t: TFn): { value: WhatsAppLanguage; label: string }[] {
  return LANGUAGES.map((value) => ({ value, label: t(`whatsapp.language_${value}`) }));
}
