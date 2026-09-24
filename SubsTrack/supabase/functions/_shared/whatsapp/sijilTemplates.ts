export type WhatsAppLanguage = "en" | "ar";

export type SijilTemplatePurpose =
  | "payment_reminder"
  | "service_outage"
  | "service_restored"
  | "service_notice";

export interface SijilTemplateSpec {
  purpose: SijilTemplatePurpose;
  name: string;
  params: string[];
  maxLength: Record<string, number>;
  body: Record<WhatsAppLanguage, string>;
  footer: Record<WhatsAppLanguage, string>;
  examples: Record<WhatsAppLanguage, Record<string, string>>;
}

export const WHATSAPP_LANGUAGES: WhatsAppLanguage[] = ["en", "ar"];

export const SIJIL_TEMPLATE_PREFIX = "sijil_";

const FOOTER: Record<WhatsAppLanguage, string> = {
  en: "Reply STOP to stop these messages",
  ar: "أرسل إيقاف لإيقاف هذه الرسائل",
};

const NAME_EXAMPLES: Record<WhatsAppLanguage, Record<string, string>> = {
  en: { customer_name: "Rami", business_name: "City Net" },
  ar: { customer_name: "رامي", business_name: "سيتي نت" },
};

// Neutral on purpose: Meta bans debt-collection pressure (docs/whatsapp.md).
export const SIJIL_TEMPLATES: SijilTemplateSpec[] = [
  {
    purpose: "payment_reminder",
    name: "sijil_payment_reminder_v1",
    params: ["customer_name", "business_name", "amount", "period", "due_date"],
    maxLength: { customer_name: 60, business_name: 60, amount: 80, period: 120, due_date: 40 },
    body: {
      en: "Hello {{customer_name}}, this is a payment reminder from {{business_name}}. Your balance of {{amount}} for {{period}} has been due since {{due_date}}. If you have already paid, please ignore this message. Thank you.",
      ar: "مرحباً {{customer_name}}، هذا تذكير بالدفع من {{business_name}}. رصيدك البالغ {{amount}} عن {{period}} مستحق منذ {{due_date}}. إذا كنت قد دفعت بالفعل، يرجى تجاهل هذه الرسالة. شكراً لك.",
    },
    footer: FOOTER,
    examples: {
      en: { ...NAME_EXAMPLES.en, amount: "$20.00", period: "September 2026", due_date: "Sep 1, 2026" },
      ar: { ...NAME_EXAMPLES.ar, amount: "20.00$", period: "أيلول 2026", due_date: "1 أيلول 2026" },
    },
  },
  {
    purpose: "service_outage",
    name: "sijil_service_outage_v1",
    params: ["customer_name", "business_name", "details"],
    maxLength: { customer_name: 60, business_name: 60, details: 400 },
    body: {
      en: "Hello {{customer_name}}, {{business_name}} would like to inform you that your service is currently interrupted. Details: {{details}}. We are working to restore it as soon as possible. We apologize for the inconvenience.",
      ar: "مرحباً {{customer_name}}، تود {{business_name}} إعلامك بأن خدمتك متوقفة حالياً. التفاصيل: {{details}}. نعمل على إعادتها في أقرب وقت ممكن. نعتذر عن الإزعاج.",
    },
    footer: FOOTER,
    examples: {
      en: { ...NAME_EXAMPLES.en, details: "maintenance in the Hamra area until 6 PM" },
      ar: { ...NAME_EXAMPLES.ar, details: "صيانة في منطقة الحمرا حتى الساعة 6 مساءً" },
    },
  },
  {
    purpose: "service_restored",
    name: "sijil_service_restored_v1",
    params: ["customer_name", "business_name"],
    maxLength: { customer_name: 60, business_name: 60 },
    body: {
      en: "Hello {{customer_name}}, {{business_name}} would like to inform you that your service is working again. Thank you for your patience.",
      ar: "مرحباً {{customer_name}}، تود {{business_name}} إعلامك بأن خدمتك عادت للعمل. شكراً لصبرك.",
    },
    footer: FOOTER,
    examples: { en: NAME_EXAMPLES.en, ar: NAME_EXAMPLES.ar },
  },
  {
    purpose: "service_notice",
    name: "sijil_service_notice_v1",
    params: ["customer_name", "business_name", "details"],
    maxLength: { customer_name: 60, business_name: 60, details: 600 },
    body: {
      en: "Hello {{customer_name}}, here is an update from {{business_name}} about your account: {{details}}. Thank you.",
      ar: "مرحباً {{customer_name}}، إليك تحديث من {{business_name}} بخصوص حسابك: {{details}}. شكراً لك.",
    },
    footer: FOOTER,
    examples: {
      en: { ...NAME_EXAMPLES.en, details: "from October 1 the monthly price of your plan will be $25" },
      ar: { ...NAME_EXAMPLES.ar, details: "ابتداءً من 1 تشرين الأول سيصبح السعر الشهري لاشتراكك 25$" },
    },
  },
];

export function sijilTemplateByName(name: string): SijilTemplateSpec | null {
  return SIJIL_TEMPLATES.find((t) => t.name === name) ?? null;
}

export function sijilTemplateByPurpose(
  purpose: SijilTemplatePurpose,
): SijilTemplateSpec {
  return SIJIL_TEMPLATES.find((t) => t.purpose === purpose)!;
}

export function isWhatsAppLanguage(value: unknown): value is WhatsAppLanguage {
  return value === "en" || value === "ar";
}
