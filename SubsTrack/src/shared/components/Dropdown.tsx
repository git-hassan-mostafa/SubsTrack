import { useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { Text } from '@/src/shared/components/Text';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/shared/constants';

export interface DropdownOption<T = string> {
  label: string;
  sublabel?: string;
  value: T;
}

interface DropdownProps<T = string> {
  label?: string;
  placeholder?: string;
  options: DropdownOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  nullable?: boolean;
  nullLabel?: string;
  nullSublabel?: string;
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
}: DropdownProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption?.label ?? (nullable && value === null ? nullLabel : null);

  function handleSelect(val: T | null) {
    onChange(val);
    setOpen(false);
  }

  type ListItem = { label: string; sublabel?: string; value: T | null; isNull: boolean };

  const listItems: ListItem[] = [
    ...(nullable
      ? [{ label: nullLabel ?? t('common.no_plan'), sublabel: nullSublabel, value: null as T | null, isNull: true }]
      : []),
    ...options.map((o) => ({ ...o, value: o.value as T | null, isNull: false })),
  ];

  return (
    <View className="mb-4">
      {label ? (
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</Text>
      ) : null}

      <Pressable
        onPress={() => setOpen(true)}
        className="border border-gray-200 rounded-xl px-4 py-3 bg-white flex-row items-center justify-between"
      >
        <Text className={`text-base flex-1 ${displayLabel ? 'text-gray-900' : 'text-gray-400'}`}>
          {displayLabel ?? placeholder ?? t('customers.select_plan')}
        </Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.gray400} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 bg-black/40 items-center justify-center px-6"
          onPress={() => setOpen(false)}
        >
          <Pressable
            className="bg-white rounded-2xl w-full overflow-hidden"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-gray-100">
              <Text className="text-base font-semibold text-gray-900">{label ?? placeholder ?? ''}</Text>
              <Pressable onPress={() => setOpen(false)}>
                <Text className="text-base text-primary font-medium">{t('common.cancel')}</Text>
              </Pressable>
            </View>

            <FlatList
              data={listItems}
              keyExtractor={(item) => String(item.value ?? '__null__')}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => {
                const isSelected = item.isNull ? value === null : item.value === value;
                return (
                  <Pressable
                    onPress={() => handleSelect(item.value)}
                    className={`flex-row items-center px-5 py-3.5 border-b border-gray-50 ${isSelected ? 'bg-indigo-50' : 'bg-white'}`}
                  >
                    <View className="flex-1">
                      <Text className={`text-base font-semibold ${isSelected ? 'text-primary' : 'text-gray-900'}`}>
                        {item.label}
                      </Text>
                      {item.sublabel ? (
                        <Text className="text-xs text-gray-400 mt-0.5">{item.sublabel}</Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
