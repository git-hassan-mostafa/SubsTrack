export type WhatsAppLanguage = "en" | "ar";

export type SijilTemplatePurpose =
  | "payment_reminder"
  | "renewal_reminder"
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

// Neutral + account-specific so Meta keeps them Utility (docs/whatsapp.md).
export const SIJIL_TEMPLATES: SijilTemplateSpec[] = [
  {
    purpose: "payment_reminder",
    name: "sijil_payment_reminder_v2",
    params: ["customer_name", "business_name", "amount", "period", "due_date"],
    maxLength: { customer_name: 60, business_name: 60, amount: 80, period: 120, due_date: 40 },
    body: {
      en: "Hello {{customer_name}}, this is a payment reminder for your subscription account with {{business_name}}. The amount of {{amount}} for {{period}} has been due since {{due_date}}. If you have already paid, please ignore this message.",
      ar: "مرحباً {{customer_name}}، هذا تذكير بالدفع لحساب اشتراكك لدى {{business_name}}. المبلغ {{amount}} عن {{period}} مستحق منذ {{due_date}}. إذا كنت قد دفعت بالفعل، يرجى تجاهل هذه الرسالة.",
    },
    footer: FOOTER,
    examples: {
      en: { ...NAME_EXAMPLES.en, amount: "$20.00", period: "September 2026", due_date: "Sep 1, 2026" },
      ar: { ...NAME_EXAMPLES.ar, amount: "20.00$", period: "أيلول 2026", due_date: "1 أيلول 2026" },
    },
  },
  {
    purpose: "renewal_reminder",
    name: "sijil_renewal_reminder_v3",
    params: ["customer_name", "business_name", "paid_until"],
    maxLength: { customer_name: 60, business_name: 60, paid_until: 40 },
    body: {
      en: "Hello {{customer_name}}, this is an account update for your subscription with {{business_name}}. Your subscription is paid until {{paid_until}}, and the next payment is due after this date. If you have already paid, please ignore this message.",
      ar: "مرحباً {{customer_name}}، هذا تحديث لحساب اشتراكك لدى {{business_name}}. اشتراكك مدفوع حتى {{paid_until}}، والدفعة التالية مستحقة بعد هذا التاريخ. إذا كنت قد دفعت بالفعل، يرجى تجاهل هذه الرسالة.",
    },
    footer: FOOTER,
    examples: {
      en: { ...NAME_EXAMPLES.en, paid_until: "October 31, 2026" },
      ar: { ...NAME_EXAMPLES.ar, paid_until: "31 تشرين الأول 2026" },
    },
  },
  {
    purpose: "service_outage",
    name: "sijil_service_outage_v2",
    params: ["customer_name", "business_name", "details"],
    maxLength: { customer_name: 60, business_name: 60, details: 400 },
    body: {
      en: "Hello {{customer_name}}, the service on your subscription with {{business_name}} is currently interrupted. Details: {{details}}. We are working to restore it as soon as possible.",
      ar: "مرحباً {{customer_name}}، الخدمة في اشتراكك لدى {{business_name}} متوقفة حالياً. التفاصيل: {{details}}. نعمل على إعادتها في أقرب وقت ممكن.",
    },
    footer: FOOTER,
    examples: {
      en: { ...NAME_EXAMPLES.en, details: "maintenance in the Hamra area until 6 PM" },
      ar: { ...NAME_EXAMPLES.ar, details: "صيانة في منطقة الحمرا حتى الساعة 6 مساءً" },
    },
  },
  {
    purpose: "service_restored",
    name: "sijil_service_restored_v2",
    params: ["customer_name", "business_name"],
    maxLength: { customer_name: 60, business_name: 60 },
    body: {
      en: "Hello {{customer_name}}, the service on your subscription with {{business_name}} is working again after the recent interruption. No action is needed from you.",
      ar: "مرحباً {{customer_name}}، عادت الخدمة في اشتراكك لدى {{business_name}} إلى العمل بعد الانقطاع الأخير. لا يلزمك القيام بأي إجراء.",
    },
    footer: FOOTER,
    examples: { en: NAME_EXAMPLES.en, ar: NAME_EXAMPLES.ar },
  },
  {
    purpose: "service_notice",
    name: "sijil_service_notice_v2",
    params: ["customer_name", "business_name", "details"],
    maxLength: { customer_name: 60, business_name: 60, details: 600 },
    body: {
      en: "Hello {{customer_name}}, here is an update about your subscription account with {{business_name}}: {{details}}. If you have any questions, please reply to this message.",
      ar: "مرحباً {{customer_name}}، إليك تحديث بخصوص حساب اشتراكك لدى {{business_name}}: {{details}}. إذا كان لديك أي سؤال، يرجى الرد على هذه الرسالة.",
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
