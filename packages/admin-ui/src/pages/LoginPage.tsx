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
        <h1>Minister 管理后台</h1>
        <p>使用飞书账号登录以管理机器人配置</p>
        <button className="btn btn-feishu" onClick={handleLogin} disabled={loading}>
          {loading ? "跳转中..." : "飞书登录"}
        </button>
      </div>
    </div>
  );
}
