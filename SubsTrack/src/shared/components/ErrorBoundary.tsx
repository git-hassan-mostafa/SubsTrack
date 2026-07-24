import { Component, type ReactNode } from "react";
import { View } from "react-native";
import { PressableOpacity } from "./PressableOpacity/PressableOpacity";
import { Text } from "@/src/shared/components/Text";
import i18n from "i18next";
import { logException } from "@/src/core/errorLog/errorLogger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.",
    };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    void logException({
      source: "boundary",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : info.componentStack,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View className="flex-1 items-center justify-center px-8 bg-white">
          <Text className="text-xl font-semibold text-gray-900 mb-2">
            {i18n.t("common.something_went_wrong")}
          </Text>
          <Text className="text-sm text-gray-500 text-center mb-6">
            {this.state.message}
          </Text>
          <PressableOpacity
            onPress={this.handleReset}
            className="bg-primary px-6 py-3 rounded-lg"
          >
            <Text className="text-white font-medium">
              {i18n.t("common.try_again")}
            </Text>
          </PressableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
