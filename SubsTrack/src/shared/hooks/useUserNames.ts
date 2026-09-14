import { useEffect, useMemo } from "react";
import { useUserSlice } from "@/src/state/hooks/useUserSlice";

/** Loads the users slice itself — a bill or receipt screen never fills it. */
export function useUserNames(): (id: string | null) => string | null {
  const users = useUserSlice((s) => s.items);
  const getUsers = useUserSlice((s) => s.getUsers);

  useEffect(() => {
    void getUsers();
  }, [getUsers]);

  return useMemo(() => {
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return (id: string | null) => (id ? (names.get(id) ?? null) : null);
  }, [users]);
}
