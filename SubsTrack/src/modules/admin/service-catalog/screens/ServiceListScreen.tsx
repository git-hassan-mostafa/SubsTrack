import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS } from "@/src/shared/constants";
import { confirm } from "@/src/shared/lib/confirm";
import { EmptyState } from "@/src/shared/components/EmptyState";
import { ErrorBanner } from "@/src/shared/components/ErrorBanner";
import {
  ActionMenu,
  type ActionMenuItem,
} from "@/src/shared/components/ActionMenu";
import { useDebounce } from "@/src/shared/hooks/useDebounce";
import SearchTextBox from "@/src/shared/components/SearchTextBox";
import {
  PageHeader,
  type SelectionAction,
} from "@/src/shared/components/PageHeader";
import { FAB } from "@/src/shared/components/FAB";
import { SelectionOverlaySlot } from "@/src/shared/components/SelectionOverlaySlot";
import { ResponsiveContainer } from "@/src/shared/components/ResponsiveContainer";
import { useEffectiveBranchFilter } from "@/src/shared/hooks/useEffectiveBranchFilter";
import {
  useSelection,
  useSelectionBackHandler,
} from "@/src/shared/hooks/useSelection";
import type { Service } from "@/src/core/types";
import { useRecordHistoryAction } from "@/src/modules/admin/audit";
import { ServiceCard } from "../components/ServiceCard";
import { ServiceFormSheet } from "../components/ServiceFormSheet";
import { useServiceSlice } from "@/src/state/hooks/useServiceSlice";

export function ServiceListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const services = useServiceSlice((s) => s.items);
  const loading = useServiceSlice((s) => s.loading);
  const error = useServiceSlice((s) => s.error);
  const fetchServices = useServiceSlice((s) => s.fetchServices);
  const deleteService = useServiceSlice((s) => s.deleteService);
  const bulkDeleteServices = useServiceSlice((s) => s.bulkDeleteServices);
  const reactivateService = useServiceSlice((s) => s.reactivateService);
  const clearError = useServiceSlice((s) => s.clearError);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [menuItem, setMenuItem] = useState<Service | null>(null);
  const [searchText, setSearchText] = useState("");
  const debouncedSearch = useDebounce(searchText);
  const branchFilter = useEffectiveBranchFilter();
  const history = useRecordHistoryAction("services");
  const selection = useSelection();
  const {
    active: selectionActive,
    selectedIds,
    toggle: toggleSelect,
    toggleMany: toggleManySelect,
    enterWith: enterSelection,
    clear: clearSelection,
  } = selection;
  useSelectionBackHandler(selectionActive, clearSelection);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    clearSelection();
    fetchServices();
  }, [branchFilter, clearSelection, fetchServices]);

  function openCreate() {
    setEditing(null);
    setFormVisible(true);
  }

  function openEdit(service: Service) {
    setEditing(service);
    setFormVisible(true);
  }

  async function handleDelete(service: Service) {
    const ok = await confirm({
      title: t("services.delete_title"),
      message: t("services.delete_message", { name: service.name }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    await deleteService(service.id);
    setFormVisible(false);
  }

  async function handleReactivate(service: Service) {
    await reactivateService(service.id);
  }

  function buildActions(service: Service | null): ActionMenuItem[] {
    if (!service) return [];
    const actions: ActionMenuItem[] = [
      {
        key: "edit",
        label: t("common.edit"),
        icon: "create-outline",
        onPress: () => openEdit(service),
      },
      history.action(service.id, service.name),
    ];
    if (service.active) {
      actions.push({
        key: "delete",
        label: t("common.delete"),
        icon: "trash-outline",
        destructive: true,
        onPress: () => void handleDelete(service),
      });
    } else {
      actions.push({
        key: "reactivate",
        label: t("common.reactivate"),
        icon: "refresh-outline",
        onPress: () => void handleReactivate(service),
      });
    }
    return actions;
  }

  const filtered = debouncedSearch
    ? services.filter((s) =>
        s.name.toLowerCase().includes(debouncedSearch.toLowerCase()),
      )
    : services;

  const activeCount = services.filter((s) => s.active).length;

  const selectedServices = filtered.filter((s) => selectedIds.has(s.id));

  async function runBulkDelete(selected: Service[]) {
    if (bulkBusy || selected.length === 0) return;
    if (selected.length === 1) {
      await handleDelete(selected[0]);
      clearSelection();
      return;
    }
    const ok = await confirm({
      title: t("services.bulk_delete_title", { count: selected.length }),
      message: t("services.bulk_delete_message", { count: selected.length }),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      await bulkDeleteServices(selected.map((s) => s.id));
    } finally {
      setBulkBusy(false);
    }
    clearSelection();
  }

  // Toolbar actions for the selection header. 1 selected → edit + delete (active)
  // / reactivate (inactive); >1 → delete only.
  function buildSelectionActions(selected: Service[]): SelectionAction[] {
    if (selected.length === 0) return [];
    const actions: SelectionAction[] = [];
    if (selected.length === 1) {
      const one = selected[0];
      actions.push({
        key: "edit",
        icon: "create-outline",
        label: t("common.edit"),
        onPress: () => {
          openEdit(one);
          clearSelection();
        },
      });
      if (!one.active) {
        actions.push({
          key: "reactivate",
          icon: "refresh-outline",
          label: t("common.reactivate"),
          onPress: () => void handleReactivate(one).then(clearSelection),
        });
      }
    }
    actions.push({
      key: "delete",
      icon: "trash-outline",
      label: t("common.delete"),
      destructive: true,
      disabled: bulkBusy,
      onPress: () => void runBulkDelete(selected),
    });
    return actions;
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <PageHeader
        title={t("services.title")}
        subtitle={t("services.active_count", { count: activeCount })}
        showBack
        onBack={() => router.back()}
        selection={{
          active: selectionActive,
          count: selection.count,
          actions: buildSelectionActions(selectedServices),
          onClose: clearSelection,
          allSelected:
            filtered.length > 0 && selectedServices.length === filtered.length,
          onToggleAll: () => toggleManySelect(filtered.map((s) => s.id)),
        }}
      />

      <ResponsiveContainer className="flex-1">
        {/* Search stays mounted while selecting so its space remains and the list
            never jumps; the selection toolbar is overlaid on the header instead. */}
        <SelectionOverlaySlot selecting={selectionActive}>
          <View className="px-4 pt-4">
            <SearchTextBox
              searchText={searchText}
              setSearchText={setSearchText}
            />
          </View>
        </SelectionOverlaySlot>
        {error ? (
          <View className="px-4 pt-4">
            <ErrorBanner message={error} onDismiss={clearError} />
          </View>
        ) : null}

        {loading && services.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{
              padding: 16,
              paddingBottom: 96,
              flexGrow: 1,
            }}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={() => {
                  clearSelection();
                  fetchServices();
                }}
                tintColor={COLORS.primary}
              />
            }
            renderItem={({ item }) => (
              <ServiceCard
                service={item}
                onEdit={openEdit}
                onMenu={setMenuItem}
                selectionMode={selectionActive}
                selected={selectedIds.has(item.id)}
                onToggleSelect={(s) => toggleSelect(s.id)}
                onEnterSelection={(s) => enterSelection(s.id)}
              />
            )}
            ListEmptyComponent={
              <EmptyState
                message={t("services.no_services")}
                subMessage={t("services.no_services_hint")}
                actionLabel={
                  !debouncedSearch
                    ? t("services.create_first_service")
                    : undefined
                }
                onAction={!debouncedSearch ? openCreate : undefined}
              />
            }
          />
        )}

        {!selectionActive && (
          <FAB onPress={openCreate} accessibilityLabel={t("common.add")} />
        )}
      </ResponsiveContainer>

      {formVisible && (
        <ServiceFormSheet
          service={editing}
          onDismiss={() => {
            setFormVisible(false);
            setEditing(null);
          }}
          onRequestDelete={(s) => void handleDelete(s)}
        />
      )}

      <ActionMenu
        visible={menuItem !== null}
        title={menuItem?.name}
        actions={buildActions(menuItem)}
        onDismiss={() => setMenuItem(null)}
      />

      {history.sheet}
    </SafeAreaView>
  );
}
