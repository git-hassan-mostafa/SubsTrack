import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { TextInput, View } from "react-native";
import { COLORS } from "@/src/shared/constants";

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
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center bg-gray-100 rounded-xl px-3 py-1">
      <Ionicons name="search-outline" size={16} color={COLORS.gray400} />
      <TextInput
        className="flex-1 ms-2 text-sm text-gray-900"
        placeholder={placeholder || t("common.input_search")}
        placeholderTextColor={COLORS.gray400}
        value={searchText}
        onChangeText={setSearchText}
        style={{ fontFamily: "Cairo" }}
      />
    </View>
  );
}
