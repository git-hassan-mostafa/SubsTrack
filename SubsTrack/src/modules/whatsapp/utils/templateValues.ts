import type { WhatsAppTemplate } from "@/src/core/types";
import {
  DEFAULT_PARAM_MAX_LENGTH,
  renderTemplate,
  sanitizeParam,
} from "@/supabase/functions/_shared/whatsapp/rules";
import {
  isWhatsAppLanguage,
  sijilTemplateByName,
} from "@/supabase/functions/_shared/whatsapp/sijilTemplates";
import type { ReminderFacts } from "./reminderFacts";

export type PlaceholderSource =
  | "customer_name"
  | "business_name"
  | "amount"
  | "period"
  | "due_date"
  | "custom";

export interface PlaceholderChoice {
  source: PlaceholderSource;
  text: string;
}

export type PlaceholderChoices = Record<string, PlaceholderChoice>;

export const PLACEHOLDER_SOURCES: PlaceholderSource[] = [
  "customer_name",
  "business_name",
  "amount",
  "period",
  "due_date",
  "custom",
];

const OWED_SOURCES: PlaceholderSource[] = ["amount", "period", "due_date"];

export interface RecipientContext {
  customerName: string;
  businessName: string;
  facts: ReminderFacts | null;
}

// A placeholder named like a Sijil field fills itself; others start as text.
export function defaultChoices(
  template: Pick<WhatsAppTemplate, "params">,
): PlaceholderChoices {
  const choices: PlaceholderChoices = {};
  for (const param of template.params) {
    const known = PLACEHOLDER_SOURCES.find((s) => s === param && s !== "custom");
    choices[param] = { source: known ?? "custom", text: "" };
  }
  return choices;
}

// The same cap whatsapp-send cuts a value to, so the field stops there first.
export function paramMaxLength(
  template: Pick<WhatsAppTemplate, "name">,
  param: string,
): number {
  return (
    sijilTemplateByName(template.name)?.maxLength[param] ??
    DEFAULT_PARAM_MAX_LENGTH
  );
}

// A template's own language wins ("en_US" is en); otherwise the fallback.
export function messageLanguage(
  template: Pick<WhatsAppTemplate, "language">,
  fallback: string,
): string {
  const base = template.language.split(/[_-]/)[0].toLowerCase();
  return isWhatsAppLanguage(base) ? base : fallback;
}

// Typed text is shown as Meta will get it: one line, cut to its cap.
export function previewText(
  template: Pick<WhatsAppTemplate, "bodyText" | "name">,
  choices: PlaceholderChoices,
  sourceLabel: (source: PlaceholderSource) => string,
): string {
  const values: Record<string, string> = {};
  for (const [param, choice] of Object.entries(choices)) {
    const typed =
      choice.source === "custom"
        ? sanitizeParam(choice.text, paramMaxLength(template, param))
        : "";
    values[param] = typed || `[${sourceLabel(choice.source)}]`;
  }
  return renderTemplate(template.bodyText ?? "", values);
}

export function needsOwedFacts(choices: PlaceholderChoices): boolean {
  return Object.values(choices).some((c) => OWED_SOURCES.includes(c.source));
}

export function missingCustomText(choices: PlaceholderChoices): string[] {
  return Object.entries(choices)
    .filter(([, c]) => c.source === "custom" && !c.text.trim())
    .map(([param]) => param);
}

// Null = this customer cannot get it (e.g. needs an amount, owes nothing).
export function resolveValues(
  choices: PlaceholderChoices,
  context: RecipientContext,
): Record<string, string> | null {
  const values: Record<string, string> = {};
  for (const [param, choice] of Object.entries(choices)) {
    const value = valueFor(choice, context);
    if (!value) return null;
    values[param] = value;
  }
  return values;
}

function valueFor(choice: PlaceholderChoice, context: RecipientContext): string {
  switch (choice.source) {
    case "customer_name":
      return context.customerName.trim();
    case "business_name":
      return context.businessName.trim();
    case "amount":
      return context.facts?.amount ?? "";
    case "period":
      return context.facts?.period ?? "";
    case "due_date":
      return context.facts?.dueDate ?? "";
    case "custom":
      return choice.text.trim();
  }
}
