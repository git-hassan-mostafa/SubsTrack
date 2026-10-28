import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

function CrashPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-gray-50 px-4 text-center">
      <p className="text-sm text-gray-500">{t("portal.crashed")}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-xl bg-primary px-6 py-3 text-base font-bold text-white"
      >
        {t("portal.reload")}
      </button>
    </div>
  );
}

// Without it a drawing error leaves the customer looking at a blank white page.
export class CrashBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    return this.state.failed ? <CrashPage /> : this.props.children;
  }
}
