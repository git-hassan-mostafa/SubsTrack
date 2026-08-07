import { View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Customer } from "@/src/core/types";
import { useAuth } from "@/src/modules/authentication/auth/hooks/useAuth";
import { AppBottomSheet } from "@/src/shared/components/AppBottomSheet";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { SheetDragArea } from "@/src/shared/components/SheetDragArea";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity/PressableOpacity";
import { HistoryList, useCustomerHistory } from "@/src/modules/admin/audit";

interface CustomerHistorySheetProps {
  customer: Customer;
  onDismiss: () => void;
}

/**
 * One customer's change timeline: the customer row, every service line it has ever
 * held, and the month payments / skips on those lines — merged newest-first, so
 * "renamed, then a plan was cancelled, then March was voided" reads as one story.
 *
 * Every entry is found through its frozen `subject_id`, not a list of child ids:
 * a cancelled line, a deleted plan and a voided payment all stay in the trail, and
 * skipped months (whose ids are a hash of line + month) become reachable at all.
 *
 * Sales and debts stay out — a sale is a one-off with its own panel on the customer
 * screen, and the debt tables are append-only, so the Debts view is their history.
 * The set lives in CUSTOMER_HISTORY_TABLES.
 */
export function CustomerHistorySheet({ customer, onDismiss }: CustomerHistorySheetProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();

  const { entries, loading, error, full, loadFull } = useCustomerHistory(customer.id);

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
