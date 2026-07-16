import { useAuthSlice } from '@/src/state/hooks/useAuthSlice';

export function useAuth() {
  const user = useAuthSlice((s) => s.user);
  return {
    user,
    isAdmin: user?.role === 'admin' || user?.role === 'superadmin',
  };
}
