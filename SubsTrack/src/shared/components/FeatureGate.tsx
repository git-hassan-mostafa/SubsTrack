import type { ReactNode } from 'react';
import {
  useCanUpgradePlan,
  useSelfServiceSignupEnabled,
} from '@/src/state/hooks/useOptionSlice';

interface GateProps {
  /** Rendered when the flag is enabled. */
  children: ReactNode;
  /** Rendered when the flag is disabled. Defaults to nothing. */
  fallback?: ReactNode;
}

// Declarative UI gates over global option flags. Each gate reads its own flag
// from the options slice and renders `children` when enabled, otherwise
// `fallback`. Wrap conditional UI in these instead of scattering the flag
// hooks + ternaries across screens — the condition lives in one place and the
// call site reads as intent.

/** Gates self-serve plan upgrades (option `AllowPlanUpgrade`). */
export function CanUpgrade({ children, fallback = null }: GateProps) {
  const enabled = useCanUpgradePlan();
  return <>{enabled ? children : fallback}</>;
}

/** Gates self-service workspace creation (option `AllowSelfServiceSignup`). */
export function CanCreateWorkspace({ children, fallback = null }: GateProps) {
  const enabled = useSelfServiceSignupEnabled();
  return <>{enabled ? children : fallback}</>;
}
