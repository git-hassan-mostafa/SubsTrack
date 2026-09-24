import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePortalStore } from "../state/portalStore";
import { buildGrids } from "../services/PortalReadModel";
import type { PortalModel } from "../services/PortalReadModel";
import { MonthGrid } from "../components/MonthGrid";
import { Money } from "../components/Money";
import { LanguageToggle } from "../components/LanguageToggle";
import { StatusCard } from "../components/StatusCard";
import { PaymentList } from "../components/PaymentList";
import { SaleList } from "../components/SaleList";
import { ServiceLines } from "../components/ServiceLines";
import { Receipt, type ReceiptTarget } from "../components/Receipt";
import { resolveLinePrice } from "@/src/modules/customer/customer-plans/utils/linePrice";

export function PortalScreen({ model }: { model: PortalModel }) {
  const { t } = useTranslation();
  const year = usePortalStore((s) => s.year);
  const setYear = usePortalStore((s) => s.setYear);
  const signOut = usePortalStore((s) => s.signOut);
  const [receipt, setReceipt] = useState<ReceiptTarget | null>(null);

  // Re-derived from rows already in memory: the read is not year-scoped, so a
  // year arrow must never trigger another request (gotcha #121).
  const grids = useMemo(() => buildGrids(model, year), [model, year]);

  if (receipt) {
    return (
      <Receipt model={model} target={receipt} onBack={() => setReceipt(null)} />
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-16">
      <header className="border-b border-gray-300 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-gray-900">
              {model.customer.name}
            </p>
            <p className="truncate text-sm text-gray-600">
              {model.orgName}
              {model.branchName ? ` · ${model.branchName}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle />
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
            >
              {t("portal.sign_out")}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
        <StatusCard model={model} />

        <Section title={t("portal.months")}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-gray-600">{t("portal.months_hint")}</p>
            <div className="flex shrink-0 items-center gap-1">
              <YearButton label="‹" onClick={() => setYear(year - 1)} />
              <span className="w-14 text-center text-base font-bold text-gray-900">
                {year}
              </span>
              <YearButton label="›" onClick={() => setYear(year + 1)} />
            </div>
          </div>

          <div className="space-y-5">
            {grids.map(({ line, entries }) => {
              const price = resolveLinePrice(line);
              return (
                <div key={line.id}>
                  <p className="mb-2 text-base font-semibold text-gray-900">
                    {line.plan?.name ?? ""}
                    {price.isFixed && price.amount !== null ? (
                      <span className="font-normal text-gray-600">
                        {" ("}
                        <Money
                          amount={price.amount}
                          currencyId={price.currencyId}
                          currencies={model.currencies}
                          displayCurrencyId={model.displayCurrencyId}
                          inline
                        />
                        {")"}
                      </span>
                    ) : null}
                  </p>
                  <MonthGrid
                    entries={entries}
                    isRegular={model.customer.isRegular}
                    onOpenReceipt={(id) => setReceipt({ kind: "month", id })}
                  />
                </div>
              );
            })}
          </div>
        </Section>

        <PaymentList model={model} onOpenReceipt={setReceipt} />
        <SaleList model={model} onOpenReceipt={setReceipt} />
        <ServiceLines model={model} />
      </main>
    </div>
  );
}

function YearButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-lg leading-none text-gray-700"
    >
      {label}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-300 bg-white p-4">
      <h2 className="mb-3 text-lg font-bold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}
