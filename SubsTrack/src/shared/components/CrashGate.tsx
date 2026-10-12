import { Component, type ErrorInfo, type ReactNode } from "react";
import { showCrash, useCrashStore } from "@/src/core/errorLog/crashStore";
import { CrashScreen } from "./CrashScreen";

interface Props {
  children: ReactNode;
}

interface CatcherState {
  failed: boolean;
}

class RenderCrashCatcher extends Component<Props, CatcherState> {
  state: CatcherState = { failed: false };

  static getDerivedStateFromError(): CatcherState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    showCrash(error, "boundary", info.componentStack ?? undefined);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// One Try again page for every crash: a drawing error, a tap handler, a failed promise.
export function CrashGate({ children }: Props) {
  const crash = useCrashStore((s) => s.crash);
  const clearCrash = useCrashStore((s) => s.clearCrash);
  if (crash) return <CrashScreen report={crash} onRetry={clearCrash} />;
  return <RenderCrashCatcher>{children}</RenderCrashCatcher>;
}
