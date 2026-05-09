import { Ionicons } from "@expo/vector-icons";
import { TextInput, View } from "react-native";

interface Props {
  searchText: string;
  setSearchText: (text: string) => void;
  placeholder?: string;
}

export default function SearchTextBox({
  searchText,
  setSearchText,
  placeholder = "Search...",
}: Props) {
  return (
    <View className="flex-row items-center bg-gray-100 rounded-xl px-3 py-1">
      <Ionicons name="search-outline" size={16} color="#9ca3af" />
      <TextInput
        className="flex-1 ms-2 text-sm text-gray-900"
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        value={searchText}
        onChangeText={setSearchText}
      />
    </View>
  );
}
