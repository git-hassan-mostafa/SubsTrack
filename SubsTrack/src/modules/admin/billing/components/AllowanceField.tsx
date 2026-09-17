import { View, type TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/src/shared/components/Text";
import { PressableOpacity } from "@/src/shared/components/PressableOpacity";
import { AppTextInput } from "@/src/shared/components/AppTextInput";
import { useTextField } from "@/src/shared/hooks/useTextField";
import { digitsOnly } from "@/src/core/utils/inputText";
import { COLORS } from "@/src/shared/constants";
import { useHoldRepeat } from "@/src/shared/hooks/useHoldRepeat";
import { signedText } from "../utils/allowanceChange";

interface Props {
  label: string;
  current: number;
  value: number;
  floor: number;
  error: string | null;
  onChange: (next: number) => void;
  onFocus: () => void;
}

// A minus may be typed or pasted into the change field; the total never takes one.
const signedDigits = (next: string): string =>
  (next.startsWith("-") ? "-" : "") + digitsOnly(next);

// Both boxes are a fixed h-12 so they line up; Android drifts a fixed-height
// field's text to the top without this.
const CENTERED_FIELD_TEXT: TextStyle = { textAlignVertical: "center" };

// One limit as a new-total box beside a signed change box — the two mirror the
// same number, so the sign is the only thing telling a raise from a cut.
export function AllowanceField({
  label,
  current,
  value,
  floor,
  error,
  onChange,
  onFocus,
}: Props) {
  const { t } = useTranslation();
  const delta = value - current;
  const raising = delta > 0;
  const lowering = delta < 0;
  const atFloor = value <= floor;

  const totalField = useTextField(
    String(value),
    (next) => onChange(Number(next) || 0),
    { sanitize: digitsOnly, expectedEcho: (next) => String(Number(next) || 0) },
  );

  const deltaField = useTextField(
    signedText(delta),
    (next) => onChange(Math.max(floor, current + (Number(next) || 0))),
    {
      sanitize: signedDigits,
      expectedEcho: (next) =>
        signedText(Math.max(floor, current + (Number(next) || 0)) - current),
    },
  );

  const step = (by: number) => onChange(Math.max(floor, value + by));
  const holdDown = useHoldRepeat(() => step(-1));
  const holdUp = useHoldRepeat(() => step(1));

  return (
    <View className="mb-4">
      <View className="flex-row items-start gap-3 mb-1">
        <View className="flex-1">
          <Text
            fontWeight="SemiBold"
            className="text-xs text-gray-500 uppercase tracking-wide mb-1.5"
          >
            {label}
          </Text>
          <AppTextInput
            {...totalField}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="0"
            placeholderTextColor={COLORS.gray400}
            onFocus={onFocus}
            containerClassName="w-full"
            style={CENTERED_FIELD_TEXT}
            className={`h-12 border rounded-xl px-4 text-base text-gray-900 bg-white ${
              error ? "border-danger" : "border-gray-200"
            }`}
          />
        </View>

        <View className="flex-1">
          <Text
            fontWeight="SemiBold"
            className="text-xs text-gray-500 uppercase tracking-wide mb-1.5"
          >
            {t("billing.change_label")}
          </Text>
          <View className="h-12 flex-row items-center rounded-xl border border-gray-200 bg-white px-1">
            <PressableOpacity
              onPress={() => step(-1)}
              {...holdDown}
              disabled={atFloor}
              className={`w-10 h-10 rounded-lg items-center justify-center ${
                atFloor ? "bg-gray-50" : "bg-gray-100"
              }`}
            >
              <Ionicons
                name="remove"
                size={16}
                color={atFloor ? COLORS.gray300 : COLORS.gray700}
              />
            </PressableOpacity>
            <AppTextInput
              {...deltaField}
              keyboardType="numbers-and-punctuation"
              maxLength={7}
              placeholder="0"
              placeholderTextColor={COLORS.gray400}
              onFocus={onFocus}
              containerClassName="flex-1"
              style={CENTERED_FIELD_TEXT}
              className={`text-center text-base ${
                raising
                  ? "text-success"
                  : lowering
                    ? "text-danger"
                    : "text-gray-400"
              }`}
            />
            <PressableOpacity
              onPress={() => step(1)}
              {...holdUp}
              className="w-10 h-10 rounded-lg bg-gray-100 items-center justify-center"
            >
              <Ionicons name="add" size={16} color={COLORS.gray700} />
            </PressableOpacity>
          </View>
        </View>
      </View>

      {error ? <Text className="text-sm text-danger">{error}</Text> : null}
    </View>
  );
}
