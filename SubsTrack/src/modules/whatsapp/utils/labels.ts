import type { WhatsAppTemplate } from "@/src/core/types";

export function templateLabel(
  template: Pick<WhatsAppTemplate, "isSijil" | "purpose" | "name" | "language">,
  t: (key: string) => string,
): string {
  return template.isSijil && template.purpose
    ? t(`whatsapp.purpose.${template.purpose}`)
    : `${template.name} (${template.language})`;
}
