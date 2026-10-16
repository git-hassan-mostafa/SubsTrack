import type { ReactNode } from "react";
import { Text } from "@/src/shared/components/Text";

interface Props {
  children: ReactNode;
  className?: string;
}

export function FieldLabel({ children, className = "mb-1.5" }: Props) {
  return (
    <Text fontWeight="Medium" className={`text-sm text-gray-700 ${className}`}>
      {children}
    </Text>
  );
}
