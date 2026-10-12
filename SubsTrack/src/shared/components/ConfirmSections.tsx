import { ScrollView, View } from "react-native";
import type { ConfirmSection } from "@shared/shared/lib/confirmStore";
import { Text } from "@/src/shared/components/Text";

// Capped height: a long list scrolls instead of pushing the buttons off screen.
export function ConfirmSections({ sections }: { sections: ConfirmSection[] }) {
  return (
    <ScrollView style={{ maxHeight: 320 }}>
      {sections.map((section, index) => (
        <View
          key={section.title}
          className={index > 0 ? "border-t border-gray-200 pt-3 mt-3" : ""}
        >
          <Text fontWeight="SemiBold" className="text-sm text-gray-900">
            {section.title}
            <Text className="text-sm text-gray-500"> ({section.items.length})</Text>
          </Text>
          {section.hint ? (
            <Text className="text-xs text-gray-500 mb-1">{section.hint}</Text>
          ) : null}
          {section.items.map((item, itemIndex) => (
            <Text key={itemIndex} className="text-sm text-gray-800">
              {"• "}
              {item.primary}
              {item.secondary ? (
                <Text className="text-sm text-gray-500">{` · ${item.secondary}`}</Text>
              ) : null}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
