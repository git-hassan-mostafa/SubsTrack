import { useTranslation } from "react-i18next";

export function usePlanDurationLabel(): (months: number) => string {
  const { t } = useTranslation();
  return (months) =>
    months === 1 ? t("plans.monthly") : t("web.plans.every_n_months", { count: months });
}
