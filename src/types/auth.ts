// src/types/auth.ts

export interface PermissionBitSet {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
};


export interface Me {
  id: number;
  email: string;
  username: string;
  portal: number;
  role: { id: number; name: string } | null;
  permissions: Record<string, PermissionBitSet>;
  contact_first_name: string;
};

export interface AuthContextValue {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string, portal_id: number) => Promise<void>;
  logout: () => void;
  can: (perm: string, action?: keyof PermissionBitSet) => boolean;
}

export interface Outlet {
  id: number;
  name: string;
}
