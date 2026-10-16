import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { COLORS } from "@/src/shared/constants";
import { useTextField } from "@/src/shared/hooks/useTextField";
import { AppTextInput } from "./AppTextInput";

interface Props {
  searchText: string;
  setSearchText: (text: string) => void;
  placeholder?: string | null;
  autoFocus?: boolean;
}

export default function SearchTextBox({
  searchText,
  setSearchText,
  placeholder = null,
  autoFocus = false,
}: Props) {
  const field = useTextField(searchText, setSearchText);

  const { t } = useTranslation();
  return (
    <View className="flex-row items-center bg-gray-200/70 rounded-full ps-4 pe-3 min-h-12">
      <Ionicons name="search-outline" size={20} color={COLORS.gray500} />
      <AppTextInput
        containerClassName="flex-1 ms-3"
        className="text-base text-gray-900"
        style={{ textAlignVertical: "top" }}
        placeholder={placeholder || t("common.input_search")}
        placeholderTextColor={COLORS.gray400}
        autoFocus={autoFocus}
        returnKeyType="search"
        {...field}
      />
    </View>
  );
}
