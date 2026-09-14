import type { ReactNode } from 'react';
import { useSelfServiceSignupEnabled } from '@/src/state/hooks/useOptionSlice';

interface GateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/** Gates self-service organization creation (option `AllowSelfServiceSignup`). */
export function CanCreateOrganization({ children, fallback = null }: GateProps) {
  const enabled = useSelfServiceSignupEnabled();
  return <>{enabled ? children : fallback}</>;
}
