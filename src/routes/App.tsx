// src/routes/App.tsx

import { Route, Routes, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

import LoginPage from "../screens/LoginPage";
import type { PermissionBitSet } from "../types/auth";
import { useEffect, type JSX } from "react";
import { PosApp } from "../screens/layout/AppShell";

function Protected({ children }: { children: JSX.Element }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="p-8 text-sm text-kk-muted">Loading…</div>;
  if (!me) return <Navigate to="/login" replace />;
  return children;
}

function RequirePerm({ perm, action = "view", children }: {
  perm: string; action?: keyof PermissionBitSet; children: JSX.Element;
}) {
  const { can } = useAuth();
  if (!can(perm, action)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { me } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <PosApp 
              locationId={me?.portal ?? 0}
              cashierName={me?.contact_first_name ?? "Cashier"}
            />
          </Protected>
        }
      >
      </Route>
    </Routes>
  );
};