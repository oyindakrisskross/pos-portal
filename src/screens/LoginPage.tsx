// src/screens/LoginPage.tsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { type Outlet } from "../types/auth";
import { fetchOutlets } from "../api/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<number | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password, location!);
      navigate("/");
    } catch (err: any) {
      setError("Invalid credentials or server error.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    (async () => {
      const data = await fetchOutlets();
      setOutlets(data);
    })();
  },[]);

  return (
    <div className="min-h-screen min-w-screen flex items-center justify-center">
      <div className="w-full max-w-sm rounded-xl shadow-xl border border-kk-border 
          bg-kk-pri-bg p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-md bg-kk-acc flex items-center 
            justify-center text-base font-bold text-kk-pri-bg">
            KK
          </div>
          <div>
            <div className="text-base font-semibold">Kriss Kross POS</div>
            <div className="text-xs text-kk-ter-text">Sign in to continue</div>
          </div>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-xs text-kk-ter-text">Email</label>
            <input
              className="w-full rounded-md px-3 py-2 text-sm outline-none border border-kk-border 
                bg-kk-ter-bg focus:border-kk-ter-bg"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-kk-ter-text">Password</label>
            <input
              className="w-full rounded-md border px-3 py-2 text-sm outline-none border-kk-border 
                focus:border-kk-ter-bg bg-kk-ter-bg"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-kk-ter-text">Outlet</label>
            <select
              className="w-full rounded-md border border-kk-border px-3 py-2 text-sm outline-none 
                focus:border-kk-ter-bg"
              value={location!}
              defaultValue={0}
              onChange={(e) => setLocation(+e.target.value)}
            >
              <option key={0} value={0} disabled>Select an Outlet</option>
              {outlets.map((o) => (
                <option 
                  key={o.id}
                  value={o.id}>
                    {o.name}
                </option>
              ))}
            </select>
          </div>
          {error && <div className="text-xs text-kk-danger">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 rounded-md bg-kk-acc hover:bg-kk-hover text-base font-medium py-2 
              cursor-pointer disabled:opacity-60 text-kk-pri-bg tracking-wide"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}