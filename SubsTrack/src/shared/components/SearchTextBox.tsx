import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { TextInput, View } from "react-native";

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
      <Ionicons name="search-outline" size={16} color="#9ca3af" />
      <TextInput
        className="flex-1 ms-2 text-sm text-gray-900"
        placeholder={placeholder || t("common.input_search")}
        placeholderTextColor="#9ca3af"
        value={searchText}
        onChangeText={setSearchText}
        style={{ fontFamily: "Cairo" }}
      />
    </View>
  );
}
