import { useState } from "react";
import { View } from "react-native";
import { SheetFlatList } from "./SheetScrollComponents";
import { PressableOpacity } from "./PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { Input } from "@/src/shared/components/Input";
import { BottomSheetScaffold } from "./BottomSheetScaffold";
import { FilterFieldButton } from "./FilterFieldButton";
import { FilterChip } from "./FilterChip";
import { FieldLabel } from "./FieldLabel";
import { SheetHeader } from "./SheetHeader";
import { matchesOptionSearch } from "@shared/shared/lib/optionSearch";

export interface DropdownOption<T = string> {
  label: string;
  sublabel?: string;
  value: T;
  disabled?: boolean;
}

// "default" = labelled form field; "chip" = pill; "filter" = FilterRow value box.
export type DropdownTriggerStyle = "default" | "chip" | "filter";

interface DropdownProps<T = string> {
  label?: string;
  placeholder?: string;
  options: DropdownOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  nullable?: boolean;
  nullLabel?: string;
  nullSublabel?: string;
  triggerStyle?: DropdownTriggerStyle;
  onAddNew?: () => void;
  disabled?: boolean;
  disabledHint?: string;
  searchable?: boolean;
}

export function Dropdown<T extends string | number | null = string>({
  label,
  placeholder,
  options,
  value,
  onChange,
  nullable = false,
  nullLabel,
  nullSublabel,
  triggerStyle = "default",
  onAddNew,
  disabled = false,
  disabledHint,
  searchable = false,
}: DropdownProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel =
    selectedOption?.label ?? (nullable && value === null ? nullLabel : null);

  const isActive = value !== null;

  const modal = (
    <DropdownModal<T>
      visible={open}
      onClose={() => setOpen(false)}
      title={label ?? placeholder ?? ""}
      options={options}
      value={value}
      onChange={onChange}
      nullable={nullable}
      nullLabel={nullLabel}
      nullSublabel={nullSublabel}
      searchable={searchable}
    />
  );

  if (triggerStyle === "filter") {
    return (
      <>
        <FilterFieldButton
          text={displayLabel ?? placeholder ?? ""}
          active={isActive}
          disabled={disabled}
          onPress={() => setOpen(true)}
        />
        {modal}
      </>
    );
  }

  if (triggerStyle === "chip") {
    return (
      <>
        <FilterChip
          label={displayLabel ?? placeholder ?? t("customers.select_plan")}
          active={isActive}
          disabled={disabled}
          dropdown
          onPress={() => setOpen(true)}
        />
        {modal}
      </>
    );
  }

  return (
    <View className="mb-4">
      {label || (onAddNew && !disabled) ? (
        <View className="flex-row items-center justify-between mb-1.5">
          {label ? <FieldLabel className="">{label}</FieldLabel> : <View />}
          {onAddNew && !disabled ? (
            <PressableOpacity
              onPress={onAddNew}
              hitSlop={8}
              ripple="borderless"
              accessibilityLabel={t("common.add_new")}
            >
              <Ionicons name="add-circle" size={22} color={COLORS.primary} />
            </PressableOpacity>
          ) : null}
        </View>
      ) : null}

      <PressableOpacity
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        containerClassName={`border rounded-xl ${
          disabled ? "border-gray-200 bg-gray-50" : "border-gray-300 bg-white"
        }`}
        className="min-h-14 px-4 py-3 flex-row items-center justify-between"
      >
        <Text
          numberOfLines={1}
          className={`text-base flex-1 ${
            disabled
              ? "text-gray-400"
              : displayLabel
                ? "text-gray-900"
                : "text-gray-400"
          }`}
        >
          {displayLabel ?? placeholder ?? t("customers.select_plan")}
        </Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.gray500} />
      </PressableOpacity>
      {disabled && disabledHint ? (
        <Text className="mt-1 text-xs text-gray-500">{disabledHint}</Text>
      ) : null}
      {modal}
    </View>
  );
}

interface DropdownModalProps<T> {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: DropdownOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  nullable?: boolean;
  nullLabel?: string;
  nullSublabel?: string;
  searchable?: boolean;
}

export function DropdownModal<T extends string | number | null = string>({
  visible,
  onClose,
  title,
  options,
  value,
  onChange,
  nullable = false,
  nullLabel,
  nullSublabel,
  searchable = false,
}: DropdownModalProps<T>) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  function handleClose() {
    setSearch("");
    onClose();
  }

  function handleSelect(val: T | null) {
    onChange(val);
    handleClose();
  }

  type ListItem = {
    label: string;
    sublabel?: string;
    value: T | null;
    isNull: boolean;
    disabled?: boolean;
  };

  const allItems: ListItem[] = [
    ...(nullable
      ? [
          {
            label: nullLabel ?? t("common.no_plan"),
            sublabel: nullSublabel,
            value: null as T | null,
            isNull: true,
          },
        ]
      : []),
    ...options.map((o) => ({
      ...o,
      value: o.value as T | null,
      isNull: false,
    })),
  ];

  const listItems = searchable
    ? allItems.filter((item) =>
        matchesOptionSearch(search, item.label, item.sublabel),
      )
    : allItems;

  return (
    <BottomSheetScaffold visible={visible} onDismiss={handleClose}>
      <SheetHeader title={title} onClose={handleClose} />

      {searchable && (
        <View className="px-4 py-2 border-b border-gray-100">
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder={t("common.input_search")}
            placeholderTextColor={COLORS.gray400}
            className="bg-gray-50 rounded-xl px-4 py-2.5 text-base text-gray-900"
            autoCorrect={false}
          />
        </View>
      )}

      <SheetFlatList
        data={listItems}
        keyExtractor={(item) => String(item.value ?? "__null__")}
        style={{ maxHeight: 360 }}
        keyboardShouldPersistTaps="always"
        renderItem={({ item }) => {
          const isSelected = item.isNull
            ? value === null
            : item.value === value;
          return (
            <PressableOpacity
              onPress={() => !item.disabled && handleSelect(item.value)}
              disabled={item.disabled}
              className={`flex-row items-center min-h-14 px-5 py-3 ${
                item.disabled
                  ? "bg-gray-50"
                  : isSelected
                    ? "bg-primary-container"
                    : "bg-white"
              }`}
            >
              <View className="flex-1">
                <Text
                  fontWeight={isSelected ? "SemiBold" : "Medium"}
                  className={`text-base ${
                    item.disabled
                      ? "text-gray-400"
                      : isSelected
                        ? "text-primary"
                        : "text-gray-900"
                  }`}
                >
                  {item.label}
                </Text>
                {item.sublabel ? (
                  <Text className="text-sm text-gray-500 mt-0.5">
                    {item.sublabel}
                  </Text>
                ) : null}
              </View>
              {isSelected && !item.disabled ? (
                <Ionicons name="checkmark" size={18} color={COLORS.primary} />
              ) : null}
            </PressableOpacity>
          );
        }}
      />
    </BottomSheetScaffold>
  );
}
