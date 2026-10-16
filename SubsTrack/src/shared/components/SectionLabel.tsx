import type { ReactNode } from "react";
import { Text } from "@/src/shared/components/Text";

interface Props {
  children: ReactNode;
  className?: string;
}

// sentence case on purpose: an all-caps label reads as a web page
export function SectionLabel({ children, className = "mb-2 px-1" }: Props) {
  return (
    <Text fontWeight="SemiBold" className={`text-sm text-gray-600 ${className}`}>
      {children}
    </Text>
  );
}
