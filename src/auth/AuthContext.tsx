// src/auth/AuthContext.tsx

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { PermissionBitSet, Me, AuthContextValue } from "../types/auth";
import { login as apiLogin, fetchMe as apiFetchMe } from "../api/auth";
import { setAccessToken, setRefreshToken } from "../api/client";
import { useInactivityLogout } from "./useInactivityLogout";

const AuthContext = createContext<AuthContextValue>({} as any);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMe = async () => {
      const current = await apiFetchMe();
      setMe(current);
      setLoading(false);
    };

    loadMe();
  }, []);

  const login = async (email: string, password: string, portal_id: number) => {
    const user = await apiLogin(email, password, portal_id);
    setMe(user);
  };

  const logout = useCallback(() => {
    setAccessToken(null);
    setRefreshToken(null);
    setMe(null);
  }, []);

  useInactivityLogout({
    enabled: !!me && !loading,
    timeoutMs: 30 * 60 * 1000, // 30 minutes
    onTimeout: logout,
  });

  const can = (perm: string, action: keyof PermissionBitSet = "view") => {
    if (!me) return false;
    const p = me.permissions?.[perm];
    return !!p && !!p[action];
  };

  return (
    <AuthContext.Provider value={{ me, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
};
