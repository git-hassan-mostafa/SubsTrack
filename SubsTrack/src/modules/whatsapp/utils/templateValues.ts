import type { WhatsAppTemplate } from "@/src/core/types";
import { renderTemplate } from "@/supabase/functions/_shared/whatsapp/rules";
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

// The preview shows each automatic value as its label, e.g. "[Amount owed]".
export function previewText(
  template: Pick<WhatsAppTemplate, "bodyText">,
  choices: PlaceholderChoices,
  sourceLabel: (source: PlaceholderSource) => string,
): string {
  const values: Record<string, string> = {};
  for (const [param, choice] of Object.entries(choices)) {
    values[param] =
      choice.source === "custom" && choice.text.trim()
        ? choice.text.trim()
        : `[${sourceLabel(choice.source)}]`;
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
