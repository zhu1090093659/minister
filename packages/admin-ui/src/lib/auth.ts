// Auth state management — simple React context for current user
import { createContext, useContext } from "react";

export interface User {
  openId: string;
  name?: string;
  avatarUrl?: string;
}

export const AuthContext = createContext<{ user: User | null; loading: boolean }>({
  user: null,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}
