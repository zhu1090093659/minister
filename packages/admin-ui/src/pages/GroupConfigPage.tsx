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
      showToast("Behavior settings saved");
    } catch (err: any) {
      showToast("Error: " + err.message);
    }
  }

  async function savePrompt() {
    if (!chatId || !promptDraft.trim()) return;
    try {
      await api.updateGroupPrompt(chatId, promptDraft);
      showToast("Group prompt saved");
    } catch (err: any) {
      showToast("Error: " + err.message);
    }
  }

  async function resetPrompt() {
    if (!chatId) return;
    try {
      await api.deleteGroupPrompt(chatId);
      setPromptDraft("");
      showToast("Reset to default");
    } catch (err: any) {
      showToast("Error: " + err.message);
    }
  }

  if (loading) return <div className="empty-state"><p>Loading...</p></div>;
  if (!config) return <div className="empty-state"><p>Group not found</p></div>;

  const tabs = [
    { key: "behavior", label: "Behavior" },
    { key: "prompt", label: "Prompt" },
    { key: "mcp", label: "MCP" },
    { key: "skills", label: "Skills" },
  ] as const;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <button className="btn btn-sm" onClick={() => navigate("/groups")}><ArrowLeft size={14} /></button>
          <h2>Group: {chatId}</h2>
        </div>
        <p>
          Prompt source: <span className={`badge badge-${config.prompt.source}`}>{config.prompt.source}</span>
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
            <h3>Group Behavior</h3>
            <button className="btn btn-sm btn-primary" onClick={saveBehavior}>Save</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>Require @mention</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Bot only responds when explicitly @mentioned in group</div>
              </div>
              <div
                className={`toggle ${behavior.requireMention ? "active" : ""}`}
                onClick={() => setBehavior({ ...behavior, requireMention: !behavior.requireMention })}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>Allow auto tool execution</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Allow the AI to automatically execute tools without confirmation</div>
              </div>
              <div
                className={`toggle ${behavior.allowAutoToolExec ? "active" : ""}`}
                onClick={() => setBehavior({ ...behavior, allowAutoToolExec: !behavior.allowAutoToolExec })}
              />
            </div>

            <div className="form-group">
              <label>Member Whitelist (one open_id per line, empty = allow all)</label>
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
            <h3>Group System Prompt</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm" onClick={resetPrompt}>Reset</button>
              <button className="btn btn-sm btn-primary" onClick={savePrompt}>Save</button>
            </div>
          </div>
          <div className="form-group">
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              placeholder="Enter a custom system prompt for this group..."
              rows={16}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Inheritance Chain</h4>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              <div>System default: {config.inheritance.systemDefault}</div>
              <div>User override: {config.inheritance.userOverride}</div>
              <div>Group override: {config.inheritance.groupOverride}</div>
            </div>
          </div>
        </div>
      )}

      {tab === "mcp" && (
        <div className="card">
          <div className="card-header">
            <h3>Group MCP Servers</h3>
          </div>
          {Object.keys(config.mcpServers).length === 0 ? (
            <div className="empty-state"><p>No group-specific MCP servers. Group inherits from system defaults.</p></div>
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
            <h3>Group Skills</h3>
          </div>
          {config.skills.length === 0 ? (
            <div className="empty-state"><p>No group-specific skills configured</p></div>
          ) : (
            <div className="config-list">
              {config.skills.map((s: any) => (
                <div key={s.name} className="config-item">
                  <div className="config-item-info">
                    <span className="config-item-name">/{s.name}</span>
                    {s.description && <span className="config-item-desc">{s.description}</span>}
                  </div>
                  <div className="config-item-actions">
                    {s.isBuiltin && <span className="badge badge-builtin">built-in</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {toast && <div className={`toast ${toast.startsWith("Error") ? "toast-error" : "toast-success"}`}>{toast}</div>}
    </div>
  );
}
