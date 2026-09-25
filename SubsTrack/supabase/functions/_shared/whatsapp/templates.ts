// @ts-nocheck — Deno runtime file.
import { graphRequest } from "./graph.ts";
import { detectParameterFormat, isSendableTemplate, templateParamNames } from "./rules.ts";
import {
  SIJIL_TEMPLATES,
  SIJIL_TEMPLATE_PREFIX,
  WHATSAPP_LANGUAGES,
  sijilTemplateByName,
} from "./sijilTemplates.ts";

const TEMPLATE_FIELDS = "id,name,language,status,category,components,parameter_format,rejected_reason";

function toRow(account, template, syncedAt: string) {
  const body = (template.components ?? []).find(
    (c) => String(c.type).toUpperCase() === "BODY",
  );
  const bodyText = body?.text ?? null;
  const params = templateParamNames(bodyText);
  const sijil = template.name.startsWith(SIJIL_TEMPLATE_PREFIX)
    ? sijilTemplateByName(template.name)
    : null;
  return {
    tenant_id: account.tenant_id,
    account_id: account.id,
    meta_template_id: String(template.id),
    name: template.name,
    language: template.language,
    category: template.category ?? null,
    status: template.status ?? "PENDING",
    rejection_reason:
      template.rejected_reason && template.rejected_reason !== "NONE"
        ? template.rejected_reason
        : null,
    parameter_format:
      String(template.parameter_format ?? "").toLowerCase() === "positional"
        ? "positional"
        : detectParameterFormat(params),
    body_text: bodyText,
    params,
    purpose: sijil?.purpose ?? null,
    is_sijil: sijil !== null,
    supported: isSendableTemplate(template.components),
    last_synced_at: syncedAt,
  };
}

export async function syncTemplates(service, account, token: string) {
  const syncedAt = new Date().toISOString();
  const rows = [];
  let after: string | null = null;
  do {
    const page = await graphRequest("GET", `${account.waba_id}/message_templates`, token, {
      query: { fields: TEMPLATE_FIELDS, limit: "100", ...(after ? { after } : {}) },
    });
    for (const template of page?.data ?? []) rows.push(toRow(account, template, syncedAt));
    after = page?.paging?.next ? (page?.paging?.cursors?.after ?? null) : null;
  } while (after);

  if (rows.length > 0) {
    const { error } = await service
      .from("whatsapp_templates")
      .upsert(rows, { onConflict: "account_id,name,language" });
    if (error) throw error;
  }
  await service
    .from("whatsapp_templates")
    .update({ status: "DELETED" })
    .eq("account_id", account.id)
    .lt("last_synced_at", syncedAt);
  return rows.length;
}

function sijilComponents(spec, language) {
  return [
    {
      type: "BODY",
      text: spec.body[language],
      example: {
        body_text_named_params: spec.params.map((name) => ({
          param_name: name,
          example: spec.examples[language][name],
        })),
      },
    },
    { type: "FOOTER", text: spec.footer[language] },
  ];
}

// Creates missing Sijil templates and resubmits rejected ones.
export async function submitSijilTemplates(service, account, token: string, log) {
  const { data: existing } = await service
    .from("whatsapp_templates")
    .select("name, language, status, meta_template_id")
    .eq("account_id", account.id)
    .eq("is_sijil", true);
  const byKey = new Map((existing ?? []).map((t) => [`${t.name}:${t.language}`, t]));

  let submitted = 0;
  for (const spec of SIJIL_TEMPLATES) {
    for (const language of WHATSAPP_LANGUAGES) {
      const current = byKey.get(`${spec.name}:${language}`);
      const components = sijilComponents(spec, language);
      try {
        if (!current || current.status === "DELETED") {
          await graphRequest("POST", `${account.waba_id}/message_templates`, token, {
            body: {
              name: spec.name,
              language,
              category: "UTILITY",
              parameter_format: "named",
              components,
            },
          });
          submitted++;
        } else if (current.status === "REJECTED" && current.meta_template_id) {
          await graphRequest("POST", current.meta_template_id, token, {
            body: { category: "UTILITY", components },
          });
          submitted++;
        }
      } catch (error) {
        log("template_submit_failed", {
          template: spec.name,
          language,
          metaCode: error?.code ?? null,
          message: error?.message ?? String(error),
        });
      }
    }
  }
  if (submitted > 0) await syncTemplates(service, account, token);
  return submitted;
}
