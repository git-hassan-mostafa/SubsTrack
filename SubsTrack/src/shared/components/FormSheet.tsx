import { ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { Pressable, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Text } from "./Text";
import { useTranslation } from "react-i18next";

interface Props {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  children: ReactNode;
}

export function FormSheet({ visible, title, onDismiss, children }: Props) {
  const { t } = useTranslation();
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["85%"], []);

  useEffect(() => {
    if (visible) {
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: "white" }}
      handleComponent={() => null}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <View className="items-center pt-3 pb-1">
        <View className="w-10 h-1 rounded-full bg-gray-300" />
      </View>
      <View className="flex-row items-center justify-between px-6 py-3 border-b border-gray-100">
        <Text fontWeight="Bold" className="text-lg text-gray-900">
          {title}
        </Text>
        <Pressable onPress={onDismiss}>
          <Text className="text-base text-primary font-medium">
            {t("common.cancel")}
          </Text>
        </Pressable>
      </View>
      <BottomSheetScrollView
        className="flex-1 px-6 pt-6"
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
