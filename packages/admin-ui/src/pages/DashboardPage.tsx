import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MessageSquare, Plug, Zap, FileText } from "lucide-react";

export function DashboardPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getUserConfig().then(setConfig).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty-state"><p>Loading...</p></div>;
  if (!config) return <div className="empty-state"><p>Failed to load config</p></div>;

  return (
    <div>
      <div className="page-header">
        <h2>Configuration Overview</h2>
        <p>Your current effective configuration at a glance</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <h3><MessageSquare size={16} style={{ marginRight: 8, verticalAlign: -2 }} />System Prompt</h3>
            <span className={`badge badge-${config.prompt.source}`}>{config.prompt.source}</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
            {config.prompt.value}
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><FileText size={16} style={{ marginRight: 8, verticalAlign: -2 }} />Memory</h3>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {config.memory.exists ? "CLAUDE.md exists and is active" : "No memory file yet"}
          </p>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><Plug size={16} style={{ marginRight: 8, verticalAlign: -2 }} />MCP Servers</h3>
          </div>
          <div className="config-list">
            {Object.keys(config.mcpServers.adminManaged).length === 0 && Object.keys(config.mcpServers.aiInstalled).length === 0
              ? <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No MCP servers configured</p>
              : <>
                  {Object.entries(config.mcpServers.adminManaged).map(([name]) => (
                    <div key={name} className="config-item" style={{ padding: "8px 12px" }}>
                      <span className="config-item-name">{name}</span>
                      <span className="badge badge-user">admin</span>
                    </div>
                  ))}
                  {Object.entries(config.mcpServers.aiInstalled).map(([name]) => (
                    <div key={name} className="config-item" style={{ padding: "8px 12px" }}>
                      <span className="config-item-name">{name}</span>
                      <span className="badge badge-builtin">AI-installed</span>
                    </div>
                  ))}
                </>
            }
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3><Zap size={16} style={{ marginRight: 8, verticalAlign: -2 }} />Skills</h3>
          </div>
          <div className="config-list">
            {config.skills.length === 0
              ? <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No skills configured</p>
              : config.skills.map((s: any) => (
                  <div key={s.name} className="config-item" style={{ padding: "8px 12px" }}>
                    <div className="config-item-info">
                      <span className="config-item-name">/{s.name}</span>
                      {s.description && <span className="config-item-desc">{s.description}</span>}
                    </div>
                    <div className="config-item-actions">
                      {s.isBuiltin && <span className="badge badge-builtin">built-in</span>}
                      <span className={`badge badge-${s.enabled ? "enabled" : "disabled"}`}>
                        {s.enabled ? "on" : "off"}
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
