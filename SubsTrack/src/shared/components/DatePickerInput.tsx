import { useRef } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/src/shared/components/Text';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

interface Props {
  label?: string;
  value: string; // YYYY-MM-DD or YYYY-MM-DD HH:mm
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  showTime?: boolean;
}

const ITEM_HEIGHT = 40;

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const CURRENT_YEAR = new Date().getFullYear();

function parseValue(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s(\d{2}):(\d{2}))?$/);
  if (match) {
    return {
      year: parseInt(match[1]),
      month: parseInt(match[2]),
      day: parseInt(match[3]),
      hour: match[4] != null ? parseInt(match[4]) : null,
      minute: match[5] != null ? parseInt(match[5]) : null,
    };
  }
  return null;
}

function ScrollColumn({
  items,
  selected,
  onSelect,
  label,
  renderItem,
}: {
  items: number[];
  selected: number;
  onSelect: (v: number) => void;
  label: string;
  renderItem?: (v: number) => string;
}) {
  const ref = useRef<ScrollView>(null);
  const selectedIndex = items.indexOf(selected);

  function handleOpen() {
    if (selectedIndex >= 0) {
      ref.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }
  }

  return (
    <View className="flex-1">
      <Text className="text-xs text-center text-gray-400 mb-1 font-medium">{label}</Text>
      <ScrollView
        ref={ref}
        style={{ height: 200 }}
        showsVerticalScrollIndicator={false}
        onLayout={handleOpen}
      >
        {items.map((v) => (
          <Pressable
            key={v}
            onPress={() => onSelect(v)}
            style={{ height: ITEM_HEIGHT }}
            className={`rounded-lg items-center justify-center ${selected === v ? 'bg-primary' : ''}`}
          >
            <Text className={`text-sm font-medium ${selected === v ? 'text-white' : 'text-gray-800'}`}>
              {renderItem ? renderItem(v) : pad(v)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function MonthScrollColumn({
  monthNames,
  selected,
  onSelect,
}: {
  monthNames: string[];
  selected: number;
  onSelect: (m: number) => void;
}) {
  const ref = useRef<ScrollView>(null);

  return (
    <View style={{ flex: 2 }}>
      <Text className="text-xs text-center text-gray-400 mb-1 font-medium">Month</Text>
      <ScrollView
        ref={ref}
        style={{ height: 200 }}
        showsVerticalScrollIndicator={false}
        onLayout={() => {
          const idx = selected - 1;
          if (idx > 0) ref.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
        }}
      >
        {monthNames.map((name, i) => {
          const m = i + 1;
          return (
            <Pressable
              key={m}
              onPress={() => onSelect(m)}
              style={{ height: ITEM_HEIGHT }}
              className={`rounded-lg items-center justify-center ${selected === m ? 'bg-primary' : ''}`}
            >
              <Text className={`text-sm font-medium ${selected === m ? 'text-white' : 'text-gray-800'}`}>
                {name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function DatePickerInput({ label, value, onChange, placeholder, minDate, maxDate, showTime = false }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const now = new Date();
  const parsed = parseValue(value);

  const [selYear, setSelYear] = useState(parsed?.year ?? CURRENT_YEAR);
  const [selMonth, setSelMonth] = useState(parsed?.month ?? now.getMonth() + 1);
  const [selDay, setSelDay] = useState(parsed?.day ?? now.getDate());
  const [selHour, setSelHour] = useState(parsed?.hour ?? now.getHours());
  const [selMinute, setSelMinute] = useState(parsed?.minute ?? now.getMinutes());

  const minYear = minDate ? parseInt(minDate.slice(0, 4)) : CURRENT_YEAR - 10;
  const maxYear = maxDate ? parseInt(maxDate.slice(0, 4)) : CURRENT_YEAR + 5;

  const maxDay = daysInMonth(selYear, selMonth);

  const MONTH_NAMES = [
    t('months.jan'), t('months.feb'), t('months.mar'), t('months.apr'),
    t('months.may'), t('months.jun'), t('months.jul'), t('months.aug'),
    t('months.sep'), t('months.oct'), t('months.nov'), t('months.dec'),
  ];

  function handleOpen() {
    const p = parseValue(value);
    if (p) {
      setSelYear(p.year);
      setSelMonth(p.month);
      setSelDay(p.day);
      setSelHour(p.hour ?? now.getHours());
      setSelMinute(p.minute ?? now.getMinutes());
    } else {
      setSelYear(now.getFullYear());
      setSelMonth(now.getMonth() + 1);
      setSelDay(now.getDate());
      setSelHour(now.getHours());
      setSelMinute(now.getMinutes());
    }
    setOpen(true);
  }

  function handleMonthChange(m: number) {
    setSelMonth(m);
    const max = daysInMonth(selYear, m);
    if (selDay > max) setSelDay(max);
  }

  function handleYearChange(y: number) {
    setSelYear(y);
    const max = daysInMonth(y, selMonth);
    if (selDay > max) setSelDay(max);
  }

  function handleConfirm() {
    const safeDay = Math.min(selDay, daysInMonth(selYear, selMonth));
    const dateStr = `${selYear}-${pad(selMonth)}-${pad(safeDay)}`;
    onChange(showTime ? `${dateStr} ${pad(selHour)}:${pad(selMinute)}` : dateStr);
    setOpen(false);
  }

  const displayValue = value || null;

  return (
    <View className="mb-4">
      {label ? (
        <Text className="text-sm font-medium text-gray-700 mb-1">{label}</Text>
      ) : null}
      <Pressable
        onPress={handleOpen}
        className="border border-gray-300 rounded-lg px-4 py-3 bg-white flex-row items-center justify-between"
      >
        <Text className={`text-base ${displayValue ? 'text-gray-900' : 'text-gray-400'}`}>
          {displayValue ?? (placeholder ?? t('customers.start_date_placeholder'))}
        </Text>
        <Text className="text-gray-400 text-base">📅</Text>
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
            {/* Header */}
            <View className="flex-row justify-between items-center px-5 py-4 border-b border-gray-100">
              <Pressable onPress={() => setOpen(false)}>
                <Text className="text-base text-gray-500">{t('common.cancel')}</Text>
              </Pressable>
              <Text className="text-base font-semibold text-gray-900">{label ?? t('customers.start_date_label')}</Text>
              <Pressable onPress={handleConfirm}>
                <Text className="text-base font-semibold text-primary">{t('common.confirm')}</Text>
              </Pressable>
            </View>

            {/* Columns */}
            <View className="flex-row px-3 py-3 gap-1">
              <ScrollColumn
                items={range(1, maxDay)}
                selected={Math.min(selDay, maxDay)}
                onSelect={setSelDay}
                label="Day"
              />
              <MonthScrollColumn
                monthNames={MONTH_NAMES}
                selected={selMonth}
                onSelect={handleMonthChange}
              />
              <ScrollColumn
                items={range(minYear, maxYear)}
                selected={selYear}
                onSelect={handleYearChange}
                label="Year"
                renderItem={(y) => String(y)}
              />
              {showTime ? (
                <>
                  <ScrollColumn
                    items={range(0, 23)}
                    selected={selHour}
                    onSelect={setSelHour}
                    label="Hr"
                  />
                  <ScrollColumn
                    items={range(0, 59)}
                    selected={selMinute}
                    onSelect={setSelMinute}
                    label="Min"
                  />
                </>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
