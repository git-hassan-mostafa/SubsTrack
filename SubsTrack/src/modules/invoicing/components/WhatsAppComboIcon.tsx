import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/src/shared/constants";

const WHATSAPP_GREEN = "#25D366";

/**
 * `pay` = collect the money AND send the receipt.
 * `report` = only re-send the receipt for something already collected.
 */
export type WhatsAppComboVariant = "pay" | "report";

const BASE_ICON: Record<WhatsAppComboVariant, keyof typeof Ionicons.glyphMap> = {
  pay: "flash-outline",
  report: "receipt-outline",
};

interface Props {
  variant: WhatsAppComboVariant;
  size?: number;
  color?: string;
}

// One glyph carrying both meanings: what the action does (pay / receipt) plus
// where it goes (WhatsApp). Used wherever an action both records or reads a
// payment and sends it on WhatsApp — a bare `logo-whatsapp` hides the paying,
// and a bare `receipt-outline` hides the sending.
export function WhatsAppComboIcon({ variant, size = 20, color }: Props) {
  const badgeSize = Math.round(size * 0.62);
  const overhang = Math.round(badgeSize * 0.25);

  return (
    <View
      style={{ width: size + overhang, height: size + overhang }}
      accessible={false}
    >
      <Ionicons
        name={BASE_ICON[variant]}
        size={size}
        color={color ?? COLORS.gray700}
      />
      {/* A white ring separates the badge from the glyph underneath, so the two
          icons stay readable where they overlap. */}
      <View
        className="absolute bg-white items-center justify-center"
        style={{
          bottom: -overhang / 2,
          right: -overhang / 2,
          width: badgeSize + 2,
          height: badgeSize + 2,
          borderRadius: (badgeSize + 2) / 2,
        }}
      >
        <Ionicons
          name="logo-whatsapp"
          size={badgeSize}
          color={WHATSAPP_GREEN}
        />
      </View>
    </View>
  );
}
