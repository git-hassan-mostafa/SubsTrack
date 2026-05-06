import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
  label?: string;
  value: string; // YYYY-MM-DD or empty
  onChange: (date: string) => void;
  placeholder?: string;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
}

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

export function DatePickerInput({ label, value, onChange, placeholder, minDate, maxDate }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const parsed = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const initYear = parsed ? parseInt(parsed[1]) : CURRENT_YEAR;
  const initMonth = parsed ? parseInt(parsed[2]) : new Date().getMonth() + 1;
  const initDay = parsed ? parseInt(parsed[3]) : 1;

  const [selYear, setSelYear] = useState(initYear);
  const [selMonth, setSelMonth] = useState(initMonth);
  const [selDay, setSelDay] = useState(initDay);

  const minYear = minDate ? parseInt(minDate.slice(0, 4)) : CURRENT_YEAR - 10;
  const maxYear = maxDate ? parseInt(maxDate.slice(0, 4)) : CURRENT_YEAR + 5;

  const maxDay = daysInMonth(selYear, selMonth);
  const safeDay = Math.min(selDay, maxDay);

  function handleOpen() {
    if (parsed) {
      setSelYear(initYear);
      setSelMonth(initMonth);
      setSelDay(initDay);
    } else {
      const now = new Date();
      setSelYear(now.getFullYear());
      setSelMonth(now.getMonth() + 1);
      setSelDay(now.getDate());
    }
    setOpen(true);
  }

  function handleConfirm() {
    const day = Math.min(selDay, daysInMonth(selYear, selMonth));
    onChange(`${selYear}-${pad(selMonth)}-${pad(day)}`);
    setOpen(false);
  }

  function handleMonthChange(m: number) {
    setSelMonth(m);
    const maxD = daysInMonth(selYear, m);
    if (selDay > maxD) setSelDay(maxD);
  }

  function handleYearChange(y: number) {
    setSelYear(y);
    const maxD = daysInMonth(y, selMonth);
    if (selDay > maxD) setSelDay(maxD);
  }

  const displayValue = value
    ? value
    : null;

  const MONTH_NAMES = [
    t('months.jan'), t('months.feb'), t('months.mar'), t('months.apr'),
    t('months.may'), t('months.jun'), t('months.jul'), t('months.aug'),
    t('months.sep'), t('months.oct'), t('months.nov'), t('months.dec'),
  ];

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
            <View className="flex-row justify-between items-center px-5 py-4 border-b border-gray-100">
              <Pressable onPress={() => setOpen(false)}>
                <Text className="text-base text-gray-500">{t('common.cancel')}</Text>
              </Pressable>
              <Text className="text-base font-semibold text-gray-900">{label ?? t('customers.start_date_label')}</Text>
              <Pressable onPress={handleConfirm}>
                <Text className="text-base font-semibold text-primary">{t('common.confirm')}</Text>
              </Pressable>
            </View>

            <View className="flex-row px-4 py-4 gap-2">
              {/* Day */}
              <View className="flex-1">
                <Text className="text-xs text-center text-gray-400 mb-2 font-medium">Day</Text>
                <ScrollView style={{ height: 160 }} showsVerticalScrollIndicator={false}>
                  {range(1, maxDay).map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => setSelDay(d)}
                      className={`py-2 rounded-lg items-center ${safeDay === d ? 'bg-primary' : ''}`}
                    >
                      <Text className={`text-sm font-medium ${safeDay === d ? 'text-white' : 'text-gray-800'}`}>
                        {pad(d)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Month */}
              <View className="flex-2" style={{ flex: 2 }}>
                <Text className="text-xs text-center text-gray-400 mb-2 font-medium">Month</Text>
                <ScrollView style={{ height: 160 }} showsVerticalScrollIndicator={false}>
                  {MONTH_NAMES.map((name, i) => {
                    const m = i + 1;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => handleMonthChange(m)}
                        className={`py-2 rounded-lg items-center ${selMonth === m ? 'bg-primary' : ''}`}
                      >
                        <Text className={`text-sm font-medium ${selMonth === m ? 'text-white' : 'text-gray-800'}`}>
                          {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Year */}
              <View className="flex-1">
                <Text className="text-xs text-center text-gray-400 mb-2 font-medium">Year</Text>
                <ScrollView style={{ height: 160 }} showsVerticalScrollIndicator={false}>
                  {range(minYear, maxYear).map((y) => (
                    <Pressable
                      key={y}
                      onPress={() => handleYearChange(y)}
                      className={`py-2 rounded-lg items-center ${selYear === y ? 'bg-primary' : ''}`}
                    >
                      <Text className={`text-sm font-medium ${selYear === y ? 'text-white' : 'text-gray-800'}`}>
                        {y}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
