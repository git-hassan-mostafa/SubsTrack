import { useMemo, useRef } from "react";
import { FlatList, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableOpacity } from "./PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import { COLORS } from "@/src/shared/constants";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { BottomSheetScaffold } from "./BottomSheetScaffold";

// "default" — full-width form field with label, used inside form sheets.
// "chip"    — compact fit-content pill, used in filter bars alongside other chips.
export type DatePickerTriggerStyle = "default" | "chip";

interface Props {
  label?: string;
  value: string; // YYYY-MM-DD or YYYY-MM-DD HH:mm
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  showTime?: boolean;
  triggerStyle?: DatePickerTriggerStyle;
  // When true (chip style), shows a clear affordance to reset the value to "".
  clearable?: boolean;
  // When true, picks a month only: the day column is hidden, the value is
  // normalized to YYYY-MM-01, and the trigger renders "MMM YYYY".
  monthOnly?: boolean;
}

const ITEM_HEIGHT = 44;

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
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
  const ref = useRef<FlatList>(null);
  const selectedIndex = Math.max(0, items.indexOf(selected));

  return (
    <View className="flex-1">
      <Text className="text-xs text-center text-gray-400 mb-1 font-medium">
        {label}
      </Text>
      <FlatList
        ref={ref}
        data={items}
        keyExtractor={(v) => String(v)}
        style={{ height: 200 }}
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        initialScrollIndex={selectedIndex}
        renderItem={({ item: v }) => (
          <PressableOpacity
            onPress={() => onSelect(v)}
            style={{ height: ITEM_HEIGHT }}
            className={`rounded-lg items-center justify-center ${selected === v ? "bg-primary" : ""}`}
          >
            <Text
              className={`text-sm font-medium ${selected === v ? "text-white" : "text-gray-800"}`}
            >
              {renderItem ? renderItem(v) : pad(v)}
            </Text>
          </PressableOpacity>
        )}
      />
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
  const ref = useRef<FlatList>(null);
  const initialIndex = Math.max(0, selected - 1);
  const { t } = useTranslation();

  return (
    <View style={{ flex: 2 }}>
      <Text className="text-xs text-center text-gray-400 mb-1 font-medium">
        {t("date_picker.month")}
      </Text>
      <FlatList
        ref={ref}
        data={monthNames}
        keyExtractor={(_, i) => String(i)}
        style={{ height: 200 }}
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        initialScrollIndex={initialIndex}
        renderItem={({ item: name, index: i }) => {
          const m = i + 1;
          return (
            <PressableOpacity
              onPress={() => onSelect(m)}
              style={{ height: ITEM_HEIGHT }}
              className={`rounded-lg items-center justify-center ${selected === m ? "bg-primary" : ""}`}
            >
              <Text
                className={`text-sm font-medium ${selected === m ? "text-white" : "text-gray-800"}`}
              >
                {name}
              </Text>
            </PressableOpacity>
          );
        }}
      />
    </View>
  );
}

export function DatePickerInput({
  label,
  value,
  onChange,
  placeholder,
  minDate,
  maxDate,
  showTime = false,
  triggerStyle = "default",
  clearable = false,
  monthOnly = false,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const withTime = showTime && !monthOnly;

  const now = new Date();
  const parsed = parseValue(value);

  const [selYear, setSelYear] = useState(parsed?.year ?? CURRENT_YEAR);
  const [selMonth, setSelMonth] = useState(parsed?.month ?? now.getMonth() + 1);
  const [selDay, setSelDay] = useState(parsed?.day ?? now.getDate());
  const [selHour, setSelHour] = useState(parsed?.hour ?? now.getHours());
  const [selMinute, setSelMinute] = useState(
    parsed?.minute ?? now.getMinutes(),
  );

  const minYear = minDate ? parseInt(minDate.slice(0, 4)) : CURRENT_YEAR - 10;
  const maxYear = maxDate ? parseInt(maxDate.slice(0, 4)) : CURRENT_YEAR + 5;

  const maxDay = daysInMonth(selYear, selMonth);

  const MONTH_NAMES = useMemo(
    () => [
      t("months.jan"),
      t("months.feb"),
      t("months.mar"),
      t("months.apr"),
      t("months.may"),
      t("months.jun"),
      t("months.jul"),
      t("months.aug"),
      t("months.sep"),
      t("months.oct"),
      t("months.nov"),
      t("months.dec"),
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ],
    [t],
  );

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
    if (monthOnly) {
      onChange(`${selYear}-${pad(selMonth)}-01`);
      setOpen(false);
      return;
    }
    const safeDay = Math.min(selDay, daysInMonth(selYear, selMonth));
    const dateStr = `${selYear}-${pad(selMonth)}-${pad(safeDay)}`;
    onChange(
      withTime ? `${dateStr} ${pad(selHour)}:${pad(selMinute)}` : dateStr,
    );
    setOpen(false);
  }

  function handleClear() {
    onChange("");
    setOpen(false);
  }

  const yearItems = useMemo(() => range(minYear, maxYear), [minYear, maxYear]);
  const dayItems = useMemo(() => range(1, maxDay), [maxDay]);
  const hourItems = useMemo(() => (withTime ? range(0, 23) : []), []);
  const minuteItems = useMemo(() => (withTime ? range(0, 59) : []), []);

  const displayValue = value || null;
  const isActive = !!displayValue;
  // Month-only chips/fields show "MMM YYYY" instead of the raw YYYY-MM-01.
  const formattedValue =
    monthOnly && parsed
      ? `${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`
      : displayValue;

  const picker = (
    <BottomSheetScaffold visible={open} onDismiss={() => setOpen(false)}>
      {/* Header */}
      <View className="flex-row justify-between items-center px-5 py-3 border-b border-gray-100">
        <PressableOpacity onPress={() => setOpen(false)}>
          <Text className="text-base text-primary font-medium">
            {t("common.cancel")}
          </Text>
        </PressableOpacity>
        <Text className="text-base font-semibold text-gray-900">
          {label ?? t("customers.start_date_label")}
        </Text>
        <PressableOpacity onPress={handleConfirm}>
          <Text className="text-base font-semibold text-primary">
            {t("common.confirm")}
          </Text>
        </PressableOpacity>
      </View>

      {/* Columns */}
      <View className="flex-row px-3 py-3 gap-1">
        {!monthOnly ? (
          <ScrollColumn
            items={dayItems}
            selected={Math.min(selDay, maxDay)}
            onSelect={setSelDay}
            label={t("date_picker.day")}
          />
        ) : null}
        <MonthScrollColumn
          monthNames={MONTH_NAMES}
          selected={selMonth}
          onSelect={handleMonthChange}
        />
        <ScrollColumn
          items={yearItems}
          selected={selYear}
          onSelect={handleYearChange}
          label={t("date_picker.year")}
          renderItem={(y) => String(y)}
        />
        {withTime ? (
          <>
            <ScrollColumn
              items={hourItems}
              selected={selHour}
              onSelect={setSelHour}
              label={t("date_picker.hour")}
            />
            <ScrollColumn
              items={minuteItems}
              selected={selMinute}
              onSelect={setSelMinute}
              label={t("date_picker.minute")}
            />
          </>
        ) : null}
      </View>

      {clearable && isActive ? (
        <PressableOpacity
          onPress={handleClear}
          className="py-3.5 items-center border-t border-gray-100"
        >
          <Text className="text-base font-medium text-red-500">
            {t("common.clear")}
          </Text>
        </PressableOpacity>
      ) : null}
    </BottomSheetScaffold>
  );

  if (triggerStyle === "chip") {
    return (
      <>
        <PressableOpacity
          onPress={handleOpen}
          className={`flex-row items-center gap-x-1.5 rounded-full px-3 py-1.5 border ${
            isActive
              ? "bg-indigo-50 border-indigo-200"
              : "bg-white border-gray-200"
          }`}
        >
          <Ionicons
            name="calendar-outline"
            size={12}
            color={isActive ? COLORS.primary : COLORS.gray400}
          />
          <Text
            className={`text-sm font-medium ${
              isActive ? "text-primary" : "text-gray-500"
            }`}
            numberOfLines={1}
          >
            {isActive
              ? `${placeholder ?? ""} ${formattedValue}`.trim()
              : (placeholder ?? t("customers.start_date_placeholder"))}
          </Text>
        </PressableOpacity>
        {picker}
      </>
    );
  }

  return (
    <View className="mb-4">
      {label ? (
        <Text className="text-sm font-medium text-gray-700 mb-1">{label}</Text>
      ) : null}
      <PressableOpacity
        onPress={handleOpen}
        className="border border-gray-300 rounded-lg px-4 py-3 bg-white flex-row items-center justify-between"
      >
        <Text
          numberOfLines={1}
          className={`text-base flex-1 ${displayValue ? "text-gray-900" : "text-gray-400"}`}
        >
          {formattedValue ?? placeholder ?? t("customers.start_date_placeholder")}
        </Text>
        <Text className="text-gray-400 text-base ms-1">📅</Text>
      </PressableOpacity>
      {picker}
    </View>
  );
}
