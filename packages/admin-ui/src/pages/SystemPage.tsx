import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function SystemPage() {
  const [defaults, setDefaults] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    api.getSystemDefaults().then(setDefaults);
    api.getSkillTemplates().then(({ templates }) => setTemplates(templates));
  }, []);

  if (!defaults) return <div className="empty-state"><p>加载中...</p></div>;

  return (
    <div>
      <div className="page-header">
        <h2>系统默认值</h2>
        <p>全局系统配置（只读）</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>引擎</h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "8px 16px", fontSize: 13 }}>
          <span style={{ color: "var(--text-muted)" }}>引擎</span>
          <span>{defaults.engine}</span>
          <span style={{ color: "var(--text-muted)" }}>模型</span>
          <span>{defaults.model}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>默认系统提示词</h3>
        </div>
        <pre style={{
          padding: 16,
          background: "var(--bg)",
          borderRadius: "var(--radius)",
          fontSize: 12,
          whiteSpace: "pre-wrap",
          maxHeight: 400,
          overflow: "auto",
          color: "var(--text-secondary)",
        }}>
          {defaults.systemPrompt}
        </pre>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>内置技能模板</h3>
        </div>
        <div className="config-list">
          {templates.map((t) => (
            <div key={t.name} className="config-item">
              <div className="config-item-info">
                <span className="config-item-name">/{t.name}</span>
                <span className="config-item-desc">{t.description}</span>
              </div>
              <span className="badge badge-builtin">{t.category}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
