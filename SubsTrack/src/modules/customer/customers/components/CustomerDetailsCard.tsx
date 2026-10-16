import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { ListGroup } from "@/src/shared/components/ListGroup";
import { ListRow } from "@/src/shared/components/ListRow";
import { useCopyText } from "@/src/shared/hooks/useCopyText";
import { openLocation } from "@/src/shared/lib/maps";
import type { Customer } from "@shared/core/types";
import { COLORS } from "@/src/shared/constants";
import { buildPortalLink } from "@shared/core/utils/portalLink";
import { isolate } from "@shared/core/utils/bidi";
import { useAuth } from "@shared/modules/authentication/auth/hooks/useAuth";
import { useBranchSlice } from "@shared/state/hooks/useBranchSlice";
import { useCustomerStatusActions } from "@shared/modules/customer/customers/hooks/useCustomerStatusActions";
import { useCustomerPortalUrl } from "@shared/state/hooks/useOptionSlice";
import { useWriteOffEverything } from "@shared/modules/ledger/hooks/useWriteOffEverything";
import { confirm } from "@shared/shared/lib/confirm";

interface CustomerDetailsCardProps {
  customer: Customer;
  onDeleted?: () => void;
}

const INFO_ICON = { iconColor: COLORS.gray600, iconBgClassName: "bg-gray-100" };

// phone lives in CustomerHero; rows show the value, its label under it
export function CustomerDetailsCard({
  customer,
  onDeleted,
}: CustomerDetailsCardProps) {
  const { t } = useTranslation();
  const customerStatus = useCustomerStatusActions();
  const writeOffEverything = useWriteOffEverything();
  const { isAdmin } = useAuth();
  const branch = useBranchSlice(
    (state) => state.items.find((b) => b.id === customer.branchId) ?? null,
  );
  const portalBaseUrl = useCustomerPortalUrl();
  const { copied, copy } = useCopyText();

  const portalLink = customer.portalEnabled
    ? buildPortalLink(portalBaseUrl, customer.id)
    : null;

  async function handleCopyPortalLink() {
    if (portalLink) await copy(portalLink);
  }

  async function handleToggleActive() {
    await customerStatus.toggleActive(customer);
  }

  async function handleWriteOffEverything() {
    if ((await writeOffEverything(customer)) !== "nothing") return;
    await confirm({
      title: t("common.not_available"),
      message: t("ledger.nothing_to_write_off"),
      confirmLabel: t("common.close"),
      hideCancel: true,
    });
  }

  async function handleDelete() {
    const { hardDeleted } = await customerStatus.remove([customer]);
    if (hardDeleted) onDeleted?.();
  }

  return (
    <>
      <ListGroup label={t("customers.details_section")} className="mx-4 mt-4 mb-1">
        {branch ? (
          <ListRow
            icon="git-branch-outline"
            {...INFO_ICON}
            title={branch.name}
            subtitle={t("branches.branch_label")}
          />
        ) : null}
        {customer.address ? (
          <ListRow
            icon="location-outline"
            {...INFO_ICON}
            title={customer.address}
            subtitle={t("customers.address_label")}
          />
        ) : null}
        {customer.area ? (
          <ListRow
            icon="map-outline"
            {...INFO_ICON}
            title={customer.area}
            subtitle={t("customers.area_label")}
          />
        ) : null}
        {customer.locationUrl ? (
          <ListRow
            icon="navigate-outline"
            title={t("customers.location_open")}
            onPress={() => void openLocation(customer.locationUrl)}
          />
        ) : null}
        {portalLink ? (
          <ListRow
            icon="globe-outline"
            {...INFO_ICON}
            title={t("customers.portal_link_label")}
            subtitle={isolate(portalLink)}
            onPress={() => void handleCopyPortalLink()}
            trailing={
              <Ionicons
                name={copied ? "checkmark-circle" : "copy-outline"}
                size={20}
                color={copied ? COLORS.success : COLORS.primary}
              />
            }
          />
        ) : null}
        {customer.notes ? (
          <ListRow
            icon="document-text-outline"
            {...INFO_ICON}
            title={customer.notes}
            titleLines={0}
            subtitle={t("customers.notes_label")}
          />
        ) : null}
        <ListRow
          icon={customer.active ? "checkmark-circle-outline" : "pause-circle-outline"}
          iconColor={customer.active ? COLORS.success : COLORS.warning}
          iconBgClassName={customer.active ? "bg-success-light" : "bg-warning-light"}
          title={customer.active ? t("common.active") : t("common.inactive")}
          subtitle={t("customers.status_label")}
          onPress={isAdmin ? () => void handleToggleActive() : undefined}
        />
      </ListGroup>
      {copied ? (
        <Text className="text-xs text-success mx-5 mb-2">
          {t("customers.portal_copied")}
        </Text>
      ) : null}

      <ListGroup className="mx-4 mt-3 mb-1">
        <ListRow
          icon="remove-circle-outline"
          title={t("ledger.write_off_everything")}
          destructive
          onPress={() => void handleWriteOffEverything()}
        />
        {isAdmin ? (
          <ListRow
            icon="trash-outline"
            title={t("customers.delete_label")}
            destructive
            onPress={() => void handleDelete()}
          />
        ) : null}
      </ListGroup>
    </>
  );
}
