import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    try {
      const { url } = await api.getFeishuUrl(window.location.origin + "/api/v1/auth/callback");
      window.location.href = url;
    } catch (err) {
      console.error("Failed to get auth URL:", err);
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Minister Admin</h1>
        <p>Log in with your Feishu account to manage bot configuration</p>
        <button className="btn btn-feishu" onClick={handleLogin} disabled={loading}>
          {loading ? "Redirecting..." : "Login with Feishu"}
        </button>
      </div>
    </div>
  );
}
