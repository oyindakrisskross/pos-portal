// src/api/auth/ts

import api, { setAccessToken, setRefreshToken } from "./client";
import type { Me, Outlet } from "../types/auth";

const normalizeMe = (payload: any): Me => {
  const user = payload.user;
  const permissions = payload.permissions || {};

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    portal: user.portal,
    role: user.role
      ? { id: user.role, name: user.role_name }
      : null,
    permissions,
    contact_first_name: user.contact_first_name,
  };
};

export async function fetchOutlets () : Promise<Outlet[] | []> {
  try {
    const { data } = await api.get<Outlet[]>("/api/locations/outlets/");
    return data;
  } catch {
    return [];
  }
};

export async function login (
  email: string, 
  password: string, 
  portal_id: number
): Promise<Me> {
  const { data } = await api.post("/api/auth/login", { email, password, portal_id });
  setAccessToken((data as any).access);
  setRefreshToken((data as any).refresh);
  return normalizeMe(data);
};

export async function fetchMe (): Promise<Me | null> {
  try {
    const { data } = await api.get("/api/auth/me");
    return normalizeMe(data);
  } catch {
    return null;
  }
};

export async function logout () {
  setAccessToken(null);
  setRefreshToken(null);
};