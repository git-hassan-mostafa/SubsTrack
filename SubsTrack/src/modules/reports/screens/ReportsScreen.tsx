import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/src/shared/components/PageHeader";
import { PeriodPicker } from "@/src/shared/components/PeriodPicker";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SegmentedTabs, type Segment } from "@/src/shared/components/SegmentedTabs";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import { findCurrency } from "@/src/core/utils/currency";
import { useCurrencySlice } from "@/src/state/hooks/useCurrencySlice";
import { useDisplayCurrencyId } from "@/src/state/hooks/useTenantSettingSlice";
import { useReportsStore } from "@/src/modules/reports/state/reportsStore";
import type { ReportSection as SectionKey } from "@/src/modules/reports/state/reportsStore";
import { ReportSection } from "../components/ReportSection";
import { MoneyReport } from "./sections/MoneyReport";
import { DebtsReport } from "./sections/DebtsReport";
import { useReportExport } from "../hooks/useReportExport";

/**
 * The Reports tab (admin-only — the tab itself is hidden for other roles).
 * Owns the page chrome: period, section switcher and export. Each section owns
 * its own cards and drill-downs.
 */
export function ReportsScreen() {
  const { t } = useTranslation();
  const currencies = useCurrencySlice((s) => s.items);
  const getCurrencies = useCurrencySlice((s) => s.getCurrencies);
  const displayCurrencyId = useDisplayCurrencyId();

  const period = useReportsStore((s) => s.period);
  const section = useReportsStore((s) => s.section);
  const money = useReportsStore((s) => s.money);
  const debts = useReportsStore((s) => s.debts);
  const loading = useReportsStore((s) => s.loading);
  const error = useReportsStore((s) => s.error);
  const setPeriod = useReportsStore((s) => s.setPeriod);
  const setSection = useReportsStore((s) => s.setSection);
  const fetchSection = useReportsStore((s) => s.fetchSection);
  const refresh = useReportsStore((s) => s.refresh);
  const clearError = useReportsStore((s) => s.clearError);

  const branchFilter = useEffectiveBranchFilter();
  const [exportError, setExportError] = useState<string | null>(null);
  const { exporting, exportSection } = useReportExport();

  // The branch chip rescopes every figure, so a change re-fetches — the same
  // contract every other panel follows.
  useEffect(() => {
    void fetchSection();
  }, [branchFilter, fetchSection]);

  useEffect(() => {
    void getCurrencies();
  }, [getCurrencies]);

  const displayCurrency = findCurrency(currencies, displayCurrencyId);

  const segments: Segment<SectionKey>[] = useMemo(
    () => [
      { key: "money", label: t("reports.section_money") },
      { key: "debts", label: t("reports.section_debts") },
    ],
    [t],
  );

  const data = section === "money" ? money : debts;

  const onExport = async () => {
    setExportError(null);
    const ok = await exportSection(section, period, money, debts, currencies);
    if (!ok) setExportError(t("reports.export_failed"));
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={["top"]}>
      <PageHeader
        title={t("reports.title")}
        iconActions={
          data && !exporting
            ? [
                {
                  key: "export",
                  icon: "download-outline",
                  label: t("reports.export"),
                  onPress: onExport,
                },
              ]
            : undefined
        }
      />

      <ResponsiveContainer>
        <View className="py-3 gap-3">
          <PeriodPicker value={period} onChange={setPeriod} />
          <View className="px-4">
            <SegmentedTabs<SectionKey>
              value={section}
              onChange={setSection}
              segments={segments}
            />
          </View>
        </View>
      </ResponsiveContainer>

      {/* Before the first answer arrives there is no data AND no error — that is
          still loading, not an empty period. */}
      <ReportSection
        loading={loading || (!data && !error)}
        error={exportError ?? error}
        onClearError={() => {
          setExportError(null);
          clearError();
        }}
        onRefresh={refresh}
        empty={!data}
      >
        {section === "money" && money ? (
          <MoneyReport data={money} currencies={currencies} displayCurrency={displayCurrency} />
        ) : null}
        {section === "debts" && debts ? (
          <DebtsReport data={debts} currencies={currencies} displayCurrency={displayCurrency} />
        ) : null}
      </ReportSection>
    </SafeAreaView>
  );
}
