import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MessageSquare, Plug, Zap, FileText } from "lucide-react";

export function DashboardPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getUserConfig().then(setConfig).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty-state"><p>加载中...</p></div>;
  if (!config) return <div className="empty-state"><p>加载配置失败</p></div>;

  return (
    <div>
      <div className="page-header">
        <h2>配置总览</h2>
        <p>当前生效的配置一览</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3><MessageSquare size={16} style={{ marginRight: 8, verticalAlign: -2 }} />系统提示词</h3>
            <span className={`badge badge-${config.prompt.source}`}>{config.prompt.source}</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
            {config.prompt.value}
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><FileText size={16} style={{ marginRight: 8, verticalAlign: -2 }} />记忆</h3>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {config.memory.exists ? "CLAUDE.md 已存在并生效" : "尚未创建记忆文件"}
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><Plug size={16} style={{ marginRight: 8, verticalAlign: -2 }} />MCP 服务器</h3>
          </div>
          <div className="config-list">
            {Object.keys(config.mcpServers.adminManaged).length === 0 && Object.keys(config.mcpServers.aiInstalled).length === 0
              ? <p style={{ fontSize: 12, color: "var(--text-muted)" }}>暂未配置 MCP 服务器</p>
              : <>
                  {Object.entries(config.mcpServers.adminManaged).map(([name]) => (
                    <div key={name} className="config-item" style={{ padding: "8px 12px" }}>
                      <span className="config-item-name">{name}</span>
                      <span className="badge badge-user">管理员配置</span>
                    </div>
                  ))}
                  {Object.entries(config.mcpServers.aiInstalled).map(([name]) => (
                    <div key={name} className="config-item" style={{ padding: "8px 12px" }}>
                      <span className="config-item-name">{name}</span>
                      <span className="badge badge-builtin">AI 安装</span>
                    </div>
                  ))}
                </>
            }
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><Zap size={16} style={{ marginRight: 8, verticalAlign: -2 }} />技能</h3>
          </div>
          <div className="config-list">
            {config.skills.length === 0
              ? <p style={{ fontSize: 12, color: "var(--text-muted)" }}>暂未配置技能</p>
              : config.skills.map((s: any) => (
                  <div key={s.name} className="config-item" style={{ padding: "8px 12px" }}>
                    <div className="config-item-info">
                      <span className="config-item-name">/{s.name}</span>
                      {s.description && <span className="config-item-desc">{s.description}</span>}
                    </div>
                    <div className="config-item-actions">
                      {s.isBuiltin && <span className="badge badge-builtin">内置</span>}
                      <span className={`badge badge-${s.enabled ? "enabled" : "disabled"}`}>
                        {s.enabled ? "开启" : "关闭"}
                      </span>
                    </div>
                  </div>
                ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}
