import { useAuthStore } from '../store/authStore';

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  return {
    user,
    isAdmin: user?.role === 'admin' || user?.role === 'superadmin',
  };
}
