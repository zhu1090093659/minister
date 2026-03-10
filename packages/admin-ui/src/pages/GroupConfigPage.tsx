import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

export function GroupConfigPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"prompt" | "behavior" | "mcp" | "skills">("behavior");
  const [toast, setToast] = useState<string | null>(null);

  // Behavior form state
  const [behavior, setBehavior] = useState({ requireMention: true, allowAutoToolExec: true, memberWhitelist: [] as string[] });
  const [promptDraft, setPromptDraft] = useState("");

  useEffect(() => {
    if (!chatId) return;
    Promise.all([
      api.getGroupConfig(chatId),
      api.getGroupBehavior(chatId),
    ]).then(([cfg, bh]) => {
      setConfig(cfg);
      setBehavior(bh.behavior);
      setPromptDraft(cfg.prompt?.source === "group" ? "" : "");
    }).finally(() => setLoading(false));
  }, [chatId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function saveBehavior() {
    if (!chatId) return;
    try {
      await api.updateGroupBehavior(chatId, behavior);
      showToast("行为设置已保存");
    } catch (err: any) {
      showToast("错误：" + err.message);
    }
  }

  async function savePrompt() {
    if (!chatId || !promptDraft.trim()) return;
    try {
      await api.updateGroupPrompt(chatId, promptDraft);
      showToast("群组提示词已保存");
    } catch (err: any) {
      showToast("错误：" + err.message);
    }
  }

  async function resetPrompt() {
    if (!chatId) return;
    try {
      await api.deleteGroupPrompt(chatId);
      setPromptDraft("");
      showToast("已恢复默认值");
    } catch (err: any) {
      showToast("错误：" + err.message);
    }
  }

  if (loading) return <div className="empty-state"><p>加载中...</p></div>;
  if (!config) return <div className="empty-state"><p>未找到该群组</p></div>;

  const tabs = [
    { key: "behavior", label: "行为" },
    { key: "prompt", label: "提示词" },
    { key: "mcp", label: "MCP" },
    { key: "skills", label: "技能" },
  ] as const;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <button className="btn btn-sm" onClick={() => navigate("/groups")}><ArrowLeft size={14} /></button>
          <h2>群组：{chatId}</h2>
        </div>
        <p>
          提示词来源：<span className={`badge badge-${config.prompt.source}`}>{config.prompt.source}</span>
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? "btn-primary" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "behavior" && (
        <div className="card">
          <div className="card-header">
            <h3>群组行为</h3>
            <button className="btn btn-sm btn-primary" onClick={saveBehavior}>保存</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>需要 @提及</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>机器人仅在群中被 @提及时才回复</div>
              </div>
              <div
                className={`toggle ${behavior.requireMention ? "active" : ""}`}
                onClick={() => setBehavior({ ...behavior, requireMention: !behavior.requireMention })}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>允许自动执行工具</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>允许 AI 自动执行工具而无需确认</div>
              </div>
              <div
                className={`toggle ${behavior.allowAutoToolExec ? "active" : ""}`}
                onClick={() => setBehavior({ ...behavior, allowAutoToolExec: !behavior.allowAutoToolExec })}
              />
            </div>

            <div className="form-group">
              <label>成员白名单（每行一个 open_id，留空表示允许所有人）</label>
              <textarea
                value={(behavior.memberWhitelist || []).join("\n")}
                onChange={(e) => setBehavior({ ...behavior, memberWhitelist: e.target.value.split("\n").filter(Boolean) })}
                placeholder="ou_xxx&#10;ou_yyy"
                rows={4}
              />
            </div>
          </div>
        </div>
      )}

      {tab === "prompt" && (
        <div className="card">
          <div className="card-header">
            <h3>群组系统提示词</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm" onClick={resetPrompt}>重置</button>
              <button className="btn btn-sm btn-primary" onClick={savePrompt}>保存</button>
            </div>
          </div>
          <div className="form-group">
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              placeholder="为此群组输入自定义系统提示词..."
              rows={16}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>继承链</h4>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              <div>系统默认：{config.inheritance.systemDefault}</div>
              <div>用户覆盖：{config.inheritance.userOverride}</div>
              <div>群组覆盖：{config.inheritance.groupOverride}</div>
            </div>
          </div>
        </div>
      )}

      {tab === "mcp" && (
        <div className="card">
          <div className="card-header">
            <h3>群组 MCP 服务器</h3>
          </div>
          {Object.keys(config.mcpServers).length === 0 ? (
            <div className="empty-state"><p>无群组专属 MCP 服务器，将继承系统默认配置。</p></div>
          ) : (
            <div className="config-list">
              {Object.entries(config.mcpServers).map(([name, srv]: [string, any]) => (
                <div key={name} className="config-item">
                  <div className="config-item-info">
                    <span className="config-item-name">{name}</span>
                    <span className="config-item-desc">{srv.type}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "skills" && (
        <div className="card">
          <div className="card-header">
            <h3>群组技能</h3>
          </div>
          {config.skills.length === 0 ? (
            <div className="empty-state"><p>未配置群组专属技能</p></div>
          ) : (
            <div className="config-list">
              {config.skills.map((s: any) => (
                <div key={s.name} className="config-item">
                  <div className="config-item-info">
                    <span className="config-item-name">/{s.name}</span>
                    {s.description && <span className="config-item-desc">{s.description}</span>}
                  </div>
                  <div className="config-item-actions">
                    {s.isBuiltin && <span className="badge badge-builtin">内置</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {toast && <div className={`toast ${toast.startsWith("错误") ? "toast-error" : "toast-success"}`}>{toast}</div>}
    </div>
  );
}
