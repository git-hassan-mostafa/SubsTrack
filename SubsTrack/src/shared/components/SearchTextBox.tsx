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
}

export default function SearchTextBox({
  searchText,
  setSearchText,
  placeholder = null,
}: Props) {
  const field = useTextField(searchText, setSearchText);

  const { t } = useTranslation();
  return (
    <View className="flex-row items-center border border-gray-200 rounded-xl bg-white px-4">
      <Ionicons name="search-outline" size={16} color={COLORS.gray400} />
      <AppTextInput
        containerClassName="flex-1 ms-2"
        className="text-base text-gray-900 p-3"
        placeholder={placeholder || t("common.input_search")}
        placeholderTextColor={COLORS.gray400}
        {...field}
      />
    </View>
  );
}
