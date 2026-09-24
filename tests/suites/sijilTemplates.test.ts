import {
  SIJIL_TEMPLATES,
  SIJIL_TEMPLATE_PREFIX,
  WHATSAPP_LANGUAGES,
  sijilTemplateByName,
  sijilTemplateByPurpose,
} from "@/supabase/functions/_shared/whatsapp/sijilTemplates";
import { templateParamNames } from "@/supabase/functions/_shared/whatsapp/rules";

describe("Sijil message templates", () => {
  it("TC-WA-T-01 names are unique, prefixed and Meta-safe", () => {
    const names = SIJIL_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.startsWith(SIJIL_TEMPLATE_PREFIX)).toBe(true);
      expect(name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it.each(SIJIL_TEMPLATES.flatMap((spec) => WHATSAPP_LANGUAGES.map((lang) => [spec.name, lang] as const)))(
    "TC-WA-T-02 %s (%s) body uses exactly its declared params, with an example for each",
    (name, lang) => {
      const spec = sijilTemplateByName(name)!;
      expect(templateParamNames(spec.body[lang]).sort()).toEqual([...spec.params].sort());
      for (const param of spec.params) {
        expect(spec.examples[lang][param]?.trim()).toBeTruthy();
        expect(spec.maxLength[param]).toBeGreaterThan(0);
      }
    },
  );

  it.each(SIJIL_TEMPLATES.flatMap((spec) => WHATSAPP_LANGUAGES.map((lang) => [spec.name, lang] as const)))(
    "TC-WA-T-03 %s (%s) never starts or ends with a placeholder and fits Meta's limits",
    (name, lang) => {
      const spec = sijilTemplateByName(name)!;
      const body = spec.body[lang].trim();
      expect(body.startsWith("{{")).toBe(false);
      expect(body.endsWith("}}")).toBe(false);
      expect(body.length).toBeLessThanOrEqual(1024);
      expect(spec.footer[lang].length).toBeLessThanOrEqual(60);
      expect(templateParamNames(spec.footer[lang])).toEqual([]);
    },
  );

  it("TC-WA-T-04 every purpose the app offers has exactly one template", () => {
    for (const purpose of ["payment_reminder", "service_outage", "service_restored", "service_notice"] as const) {
      expect(sijilTemplateByPurpose(purpose).purpose).toBe(purpose);
    }
    expect(sijilTemplateByName("not_a_template")).toBeNull();
  });
});
