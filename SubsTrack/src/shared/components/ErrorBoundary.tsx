import { Component, type ReactNode } from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/src/shared/components/Text';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <View className="flex-1 items-center justify-center px-8 bg-white">
          <Text className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</Text>
          <Text className="text-sm text-gray-500 text-center mb-6">{this.state.message}</Text>
          <Pressable
            onPress={this.handleReset}
            className="bg-primary px-6 py-3 rounded-lg"
          >
            <Text className="text-white font-medium">Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
