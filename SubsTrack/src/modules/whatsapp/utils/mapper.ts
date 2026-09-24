import type {
  WhatsAppAccount,
  WhatsAppAccountStatus,
  WhatsAppMessage,
  WhatsAppMessageStatus,
  WhatsAppOptOut,
  WhatsAppTemplate,
  WhatsAppTemplatePurpose,
} from "@/src/core/types";
import type {
  DbWhatsAppAccount,
  DbWhatsAppMessage,
  DbWhatsAppOptOut,
  DbWhatsAppTemplate,
} from "@/src/core/types/db";

export function mapDbWhatsAppAccount(db: DbWhatsAppAccount): WhatsAppAccount {
  return {
    id: db.id,
    wabaId: db.waba_id,
    phoneNumberId: db.phone_number_id,
    displayPhoneNumber: db.display_phone_number,
    verifiedName: db.verified_name,
    isCoexistence: Boolean(db.is_coexistence),
    status: db.status as WhatsAppAccountStatus,
    attentionCode: db.attention_code,
    qualityRating: db.quality_rating,
    messagingLimitTier: db.messaging_limit_tier,
    nameStatus: db.name_status,
    consentConfirmedAt: db.consent_confirmed_at,
    connectedAt: db.connected_at,
  };
}

export function mapDbWhatsAppTemplate(db: DbWhatsAppTemplate): WhatsAppTemplate {
  return {
    id: db.id,
    name: db.name,
    language: db.language,
    category: db.category,
    status: db.status,
    rejectionReason: db.rejection_reason,
    parameterFormat: db.parameter_format === "positional" ? "positional" : "named",
    bodyText: db.body_text,
    params: Array.isArray(db.params) ? db.params.map(String) : [],
    purpose: (db.purpose as WhatsAppTemplatePurpose | null) ?? null,
    isSijil: Boolean(db.is_sijil),
    supported: Boolean(db.supported),
  };
}

export function mapDbWhatsAppMessage(db: DbWhatsAppMessage): WhatsAppMessage {
  return {
    id: db.id,
    customerId: db.customer_id,
    customerName: db.customers?.name ?? null,
    batchId: db.batch_id,
    templateName: db.template_name,
    purpose: (db.purpose as WhatsAppTemplatePurpose | null) ?? null,
    status: db.status as WhatsAppMessageStatus,
    errorKey: db.error_key,
    errorCode: db.error_code,
    errorTitle: db.error_title,
    createdAt: db.created_at,
    deliveredAt: db.delivered_at,
    readAt: db.read_at,
    failedAt: db.failed_at,
  };
}

export function mapDbWhatsAppOptOut(db: DbWhatsAppOptOut): WhatsAppOptOut {
  return {
    id: db.id,
    customerId: db.customer_id,
    phoneE164: db.phone_e164,
    source: db.source === "admin" ? "admin" : "stop_reply",
    createdAt: db.created_at,
  };
}
