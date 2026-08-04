import { useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { AuditRecordTarget, Customer } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth/hooks/useAuth";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { HistoryList, useRecordHistory } from "@/src/modules/admin/audit";

interface CustomerHistorySheetProps {
  customer: Customer;
  onDismiss: () => void;
}

/**
 * One customer's change timeline: the customer row itself PLUS each of its service
 * lines, merged newest-first — so "renamed, then moved branch, then a plan was
 * cancelled" reads as one story instead of three separate lookups.
 *
 * Payments, sales and debts are deliberately NOT here: a busy customer has hundreds
 * of them and they would bury the profile edits this sheet exists to show. Each of
 * those already has its own history (the payment detail sheet's History action) or
 * its own panel on the customer detail screen.
 */
export function CustomerHistorySheet({ customer, onDismiss }: CustomerHistorySheetProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();

  // The customer plus every service line it has ever held (cancelled lines still
  // carry history worth reading). Skipped months are not included — their ids are a
  // hash of (line, month) and are not enumerable without querying every month.
  const targets = useMemo<AuditRecordTarget[]>(
    () => [
      { table: "customers", recordId: customer.id },
      ...(customer.customerPlans ?? []).map((line) => ({
        table: "customer_plans" as const,
        recordId: line.id,
      })),
    ],
    [customer.id, customer.customerPlans],
  );

  const { entries, loading, error, full, loadFull } = useRecordHistory(targets);

  return (
    <AppBottomSheet visible onDismiss={onDismiss} variant="full">
      <ResponsiveContainer className="flex-1">
        <SheetDragArea className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
          <View className="flex-1 pe-2">
            <Text fontWeight="Bold" className="text-lg text-gray-900" numberOfLines={1}>
              {t("audit.customer_history_title")}
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>
              {customer.name}
            </Text>
          </View>
          <PressableOpacity onPress={onDismiss}>
            <Text className="text-base text-primary font-medium">{t("common.close")}</Text>
          </PressableOpacity>
        </SheetDragArea>

        {/*
          Staff can open this sheet, but the audit_logs_select policy returns them no
          rows. Without this, an empty list would read as "this customer was never
          changed" — a false statement. Say it is restricted instead.
        */}
        {isAdmin ? (
          <HistoryList
            inSheet
            entries={entries}
            loading={loading}
            error={error}
            scope={full ? "full" : "local"}
            onLoadFull={loadFull}
            emptyTitle={t("audit.record_empty_title")}
            emptyDescription={t("audit.record_empty_desc")}
          />
        ) : (
          <View className="flex-1 justify-center">
            <EmptyState
              message={t("audit.admin_only_title")}
              subMessage={t("audit.admin_only_desc")}
            />
          </View>
        )}
      </ResponsiveContainer>
    </AppBottomSheet>
  );
}
