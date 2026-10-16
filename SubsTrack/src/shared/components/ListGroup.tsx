import { Children, Fragment, type ReactNode } from "react";
import { View } from "react-native";
import { CARD_SURFACE } from "@/src/shared/constants";
import { SectionLabel } from "@/src/shared/components/SectionLabel";

interface Props {
  label?: string;
  children: ReactNode;
  className?: string;
}

// null children drop out before the inset dividers are placed between rows
export function ListGroup({ label, children, className = "mx-4 mb-5" }: Props) {
  const rows = Children.toArray(children);
  if (rows.length === 0) return null;

  return (
    <View className={className}>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      <View className={`${CARD_SURFACE} overflow-hidden`}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 ? <View className="h-px bg-gray-100 mx-4" /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}
