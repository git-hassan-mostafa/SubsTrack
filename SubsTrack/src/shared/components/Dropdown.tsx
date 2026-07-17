import { useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { PressableOpacity } from "./PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";
import { Input } from "@/src/shared/components/Input";

export interface DropdownOption<T = string> {
  label: string;
  sublabel?: string;
  value: T;
}

// "default" — full-width form field with label, used inside form sheets.
// "chip"    — compact fit-content pill, used in filter bars alongside other chips.
export type DropdownTriggerStyle = "default" | "chip";

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
  // Renders a "+" button beside the label (default trigger style only) that
  // opens a form to create a new entity without leaving the current form.
  onAddNew?: () => void;
  // When true the trigger is greyed out and can't be opened (e.g. a plan picker
  // gated behind an unselected branch). An optional hint shows in place of the
  // value while disabled.
  disabled?: boolean;
  disabledHint?: string;
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
}: DropdownProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel =
    selectedOption?.label ?? (nullable && value === null ? nullLabel : null);

  const isActive = value !== null;

  if (triggerStyle === "chip") {
    return (
      <>
        <PressableOpacity
          onPress={() => !disabled && setOpen(true)}
          disabled={disabled}
          className={`flex-row items-center gap-x-1.5 rounded-full px-3 py-1.5 border ${
            disabled
              ? "bg-gray-50 border-gray-100 opacity-50"
              : isActive
                ? "bg-indigo-50 border-indigo-200"
                : "bg-white border-gray-200"
          }`}
        >
          <Text
            className={`text-sm font-medium ${
              isActive ? "text-primary" : "text-gray-500"
            }`}
            numberOfLines={1}
          >
            {displayLabel ?? placeholder ?? t("customers.select_plan")}
          </Text>
          <Ionicons
            name="chevron-down"
            size={12}
            color={isActive ? COLORS.primary : COLORS.gray400}
          />
        </PressableOpacity>

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
        />
      </>
    );
  }

  return (
    <View className="mb-4">
      {label || onAddNew ? (
        <View className="flex-row items-center justify-between mb-1.5">
          {label ? (
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {label}
            </Text>
          ) : (
            <View />
          )}
          {onAddNew ? (
            <PressableOpacity
              onPress={onAddNew}
              hitSlop={8}
              accessibilityLabel={t("common.add_new")}
            >
              <Ionicons name="add-circle" size={18} color={COLORS.primary} />
            </PressableOpacity>
          ) : null}
        </View>
      ) : null}

      <PressableOpacity
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        className={`border rounded-xl px-4 py-3 flex-row items-center justify-between ${
          disabled ? "border-gray-100 bg-gray-50" : "border-gray-200 bg-white"
        }`}
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
          {disabled
            ? (disabledHint ?? placeholder ?? t("customers.select_plan"))
            : (displayLabel ?? placeholder ?? t("customers.select_plan"))}
        </Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.gray400} />
      </PressableOpacity>

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
      />
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
  hideSearch?: boolean;
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
  hideSearch,
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

  const listItems = search.trim()
    ? allItems.filter((item) =>
        item.label.toLowerCase().includes(search.toLowerCase()),
      )
    : allItems;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable
          className="flex-1 bg-black/40 items-center justify-center px-6"
          onPress={handleClose}
        >
          <Pressable
            className="bg-white rounded-2xl w-full max-w-sm overflow-hidden"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-100">
              <Text className="text-base font-semibold text-gray-900">
                {title}
              </Text>
              <PressableOpacity onPress={handleClose}>
                <Text className="text-base text-primary font-medium">
                  {t("common.cancel")}
                </Text>
              </PressableOpacity>
            </View>

            {hideSearch == false && (
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

            <FlatList
              data={listItems}
              keyExtractor={(item) => String(item.value ?? "__null__")}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => {
                const isSelected = item.isNull
                  ? value === null
                  : item.value === value;
                return (
                  <PressableOpacity
                    onPress={() => handleSelect(item.value)}
                    className={`flex-row items-center px-5 py-3.5 border-b border-gray-50 ${isSelected ? "bg-indigo-50" : "bg-white"}`}
                  >
                    <View className="flex-1">
                      <Text
                        className={`text-base font-semibold ${isSelected ? "text-primary" : "text-gray-900"}`}
                      >
                        {item.label}
                      </Text>
                      {item.sublabel ? (
                        <Text className="text-xs text-gray-400 mt-0.5">
                          {item.sublabel}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={COLORS.primary}
                      />
                    ) : null}
                  </PressableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
