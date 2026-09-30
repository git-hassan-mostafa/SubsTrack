import { memo } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  CardChips,
  CardMeta,
  CardTitle,
} from "@/src/shared/components/CardText";
import type { TFunction } from "i18next";
import type { Customer, CustomerStatus } from "@shared/core/types";
import { COLORS } from "../../../../shared/constants";
import { EntityCard } from "@/src/shared/components/EntityCard";
import { Chip, type ChipTone } from "@/src/shared/components/Chip";
import { planSummary as linesSummary } from "@shared/modules/customer/customer-plans/utils/lineLabel";
import { customerPills, type CustomerPill } from "@shared/modules/customer/customers/utils/customerPills";

interface Props {
  customer: Customer;
  status: CustomerStatus | null;
  debtLabel?: string | null;
  onPress: (customer: Customer) => void;
  onMenu: (customer: Customer) => void;
  menuLoading?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (customer: Customer) => void;
  onEnterSelection?: (customer: Customer) => void;
}

interface CardChip {
  key: string;
  text: string;
  tone: ChipTone;
}

const PILL_STYLES: Record<
  Exclude<CustomerPill, "debt">,
  {
    label: (t: TFunction, s: CustomerStatus | null) => string;
    tone: ChipTone;
  }
> = {
  inactive: {
    label: (t) => t("common.inactive"),
    tone: "gray",
  },
  non_regular: {
    label: (t) => t("customers.non_regular"),
    tone: "indigo",
  },
  paid: {
    label: (t) => t("common.paid"),
    tone: "emerald",
  },
  mixed: {
    label: (t, s) =>
      t("customers.plans_paid_count", {
        paid: s?.planCount.paid ?? 0,
        total: s?.planCount.total ?? 0,
      }),
    tone: "amber",
  },
  unpaid: {
    label: (t) => t("dashboard.unpaid"),
    tone: "red",
  },
  skipped: {
    label: (t) => t("payments.skip.skipped_label"),
    tone: "gray",
  },
  not_due_yet: {
    label: (t) => t("payments.not_due_yet_label"),
    tone: "sky",
  },
  overdue: {
    label: (t) => t("customers.overdue"),
    tone: "red",
  },
};

// The pill rule is Shared customerPills; only the look is decided here.
function buildChips(
  customer: Customer,
  status: CustomerStatus | null,
  debtLabel: string | null,
  t: TFunction,
): CardChip[] {
  return customerPills(customer, status, debtLabel !== null).map((pill) =>
    pill === "debt"
      ? { key: pill, text: `${t("customers.debt")} ${debtLabel}`, tone: "orange" }
      : {
          key: pill,
          text: PILL_STYLES[pill].label(t, status),
          tone: PILL_STYLES[pill].tone,
        },
  );
}

export const CustomerCard = memo(function CustomerCard({
  customer,
  status,
  debtLabel = null,
  onPress,
  onMenu,
  menuLoading = false,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  onEnterSelection,
}: Props) {
  const { t } = useTranslation();

  const planSummary = linesSummary(customer, t);

  const chips = buildChips(customer, status, debtLabel, t);

  return (
    <EntityCard
      icon="person-outline"
      onPress={() => onPress(customer)}
      onMenu={() => onMenu(customer)}
      menuLoading={menuLoading}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={() => onToggleSelect?.(customer)}
      onEnterSelection={
        onEnterSelection ? () => onEnterSelection(customer) : undefined
      }
    >
      <View className="flex-1 me-2">
        <View className="flex-row items-center">
          <CardTitle className="flex-1" numberOfLines={1}>
            {customer.name}
          </CardTitle>
          <CardMeta>{planSummary}</CardMeta>
        </View>
        {!!customer.phoneNumber && (
          <View className="flex-row items-center mt-1">
            <Ionicons name="call" size={12} color={COLORS.gray400} />
            <CardMeta className="ms-1" numberOfLines={1}>
              {customer.phoneNumber}
            </CardMeta>
          </View>
        )}
        <CardChips reserveSpace>
          {chips.map((chip) => (
            <Chip key={chip.key} text={chip.text} tone={chip.tone} />
          ))}
        </CardChips>
      </View>
    </EntityCard>
  );
});
