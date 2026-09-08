"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { AdminApiError, readAdminJson } from "../lib/admin-api";
import { AdminConsole, AdminUiSession } from "./AdminConsole";

export function AdminPortal() {
  const [session, setSession] = useState<AdminUiSession | null>(null);
  const [loading, setLoading] = useState(true);
  const handleSessionExpired = useCallback(() => setSession(null), []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/auth/me", { cache: "no-store" })
      .then((response) => readAdminJson<AdminUiSession>(response))
      .then((next) => { if (!cancelled) setSession(next); })
      .catch(() => { if (!cancelled) setSession(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <main className="admin-login-shell"><div className="admin-login-card is-loading"><span className="spinner" /><p>正在确认管理员会话</p></div></main>;
  }
  if (!session) return <AdminLogin onAuthenticated={setSession} />;
  return <AdminConsole session={session} onSessionExpired={handleSessionExpired} />;
}

function AdminLogin({ onAuthenticated }: { onAuthenticated: (session: AdminUiSession) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const next = await readAdminJson<AdminUiSession>(response);
      setPassword("");
      onAuthenticated(next);
    } catch (caught) {
      const message = caught instanceof AdminApiError && caught.code === "ADMIN_LOGIN_RATE_LIMITED"
        ? "登录失败次数过多，请十五分钟后再试。"
        : "用户名或密码不正确。";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login-shell">
      <form className="admin-login-card" onSubmit={submit}>
        <div className="admin-login-mark"><ShieldCheck size={28} /></div>
        <span className="panel-kicker">NCPA ADMIN</span>
        <h1>管理员登录</h1>
        <p>请使用分配给你自己的管理员用户名和密码。</p>
        <label><span>用户名</span><input autoComplete="username" required maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label><span>密码</span><div className="admin-password-field"><KeyRound size={16} /><input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></div></label>
        {error ? <div className="admin-login-error" role="alert">{error}</div> : null}
        <button className="primary-admin-button" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : <LogIn size={16} />}{busy ? "正在登录" : "登录管理台"}</button>
        <small>如要联系增加管理员请联系2270027</small>
      </form>
    </main>
  );
}
