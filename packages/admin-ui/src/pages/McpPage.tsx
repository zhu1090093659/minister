import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, Play } from "lucide-react";

interface McpServer {
  type: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  enabled: boolean;
}

export function McpPage() {
  const [servers, setServers] = useState<Record<string, McpServer>>({});
  const [showForm, setShowForm] = useState(false);
  const [editName, setEditName] = useState("");
  const [form, setForm] = useState<McpServer & { name: string }>({
    name: "", type: "stdio", command: "", args: [], env: {}, enabled: true,
  });
  const [toast, setToast] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail?: string }>>({});

  useEffect(() => { loadServers(); }, []);

  async function loadServers() {
    const { servers } = await api.getUserMcp();
    setServers(servers);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function openAdd() {
    setEditName("");
    setForm({ name: "", type: "stdio", command: "", args: [], env: {}, enabled: true });
    setShowForm(true);
  }

  function openEdit(name: string, srv: McpServer) {
    setEditName(name);
    setForm({ ...srv, name });
    setShowForm(true);
  }

  async function handleSave() {
    const name = form.name || editName;
    if (!name) return;
    const { name: _, ...config } = form;
    try {
      await api.updateUserMcp(name, config);
      await loadServers();
      setShowForm(false);
      showToast(`服务器 "${name}" 已保存`);
    } catch (err: any) {
      showToast("错误：" + err.message);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`确定删除 MCP 服务器 "${name}"？`)) return;
    try {
      await api.deleteUserMcp(name);
      await loadServers();
      showToast(`服务器 "${name}" 已删除`);
    } catch (err: any) {
      showToast("错误：" + err.message);
    }
  }

  async function handleTest(name: string) {
    try {
      const result = await api.testUserMcp(name);
      setTestResults((r) => ({ ...r, [name]: result }));
    } catch (err: any) {
      setTestResults((r) => ({ ...r, [name]: { ok: false, detail: err.message } }));
    }
  }

  const entries = Object.entries(servers);

  return (
    <div>
      <div className="page-header">
        <h2>MCP 服务器</h2>
        <p>管理工作区的 Model Context Protocol 服务器</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{entries.length} 个服务器</h3>
          <button className="btn btn-sm btn-primary" onClick={openAdd}><Plus size={14} /> 添加服务器</button>
        </div>

        {entries.length === 0 ? (
          <div className="empty-state"><p>尚未配置 MCP 服务器</p></div>
        ) : (
          <div className="config-list">
            {entries.map(([name, srv]) => (
              <div key={name} className="config-item">
                <div className="config-item-info">
                  <span className="config-item-name">{name}</span>
                  <span className="config-item-desc">
                    {srv.type === "stdio" ? `${srv.command} ${(srv.args || []).join(" ")}` : srv.url}
                  </span>
                  {testResults[name] && (
                    <span style={{ fontSize: 11, color: testResults[name].ok ? "var(--success)" : "var(--danger)" }}>
                      {testResults[name].ok ? "已连接" : `失败：${testResults[name].detail || "未知错误"}`}
                    </span>
                  )}
                </div>
                <div className="config-item-actions">
                  <span className={`badge badge-${srv.type === "stdio" ? "system" : "user"}`}>{srv.type}</span>
                  <button className="btn btn-sm" onClick={() => handleTest(name)} title="测试连接"><Play size={12} /></button>
                  <button className="btn btn-sm" onClick={() => openEdit(name, srv)}>编辑</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(name)}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editName ? `编辑 "${editName}"` : "添加 MCP 服务器"}</h3>

            {!editName && (
              <div className="form-group">
                <label>名称</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="my-server" />
              </div>
            )}

            <div className="form-group">
              <label>类型</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
                <option value="stdio">stdio</option>
                <option value="sse">SSE</option>
                <option value="http">HTTP</option>
              </select>
            </div>

            {form.type === "stdio" ? (
              <>
                <div className="form-group">
                  <label>命令</label>
                  <input className="input" value={form.command || ""} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder="npx" />
                </div>
                <div className="form-group">
                  <label>参数（每行一个）</label>
                  <textarea
                    value={(form.args || []).join("\n")}
                    onChange={(e) => setForm({ ...form, args: e.target.value.split("\n").filter(Boolean) })}
                    placeholder="-y&#10;@modelcontextprotocol/server-github"
                    rows={4}
                  />
                </div>
                <div className="form-group">
                  <label>环境变量（KEY=VALUE，每行一个）</label>
                  <textarea
                    value={Object.entries(form.env || {}).map(([k, v]) => `${k}=${v}`).join("\n")}
                    onChange={(e) => {
                      const env: Record<string, string> = {};
                      e.target.value.split("\n").filter(Boolean).forEach((line) => {
                        const idx = line.indexOf("=");
                        if (idx > 0) env[line.slice(0, idx)] = line.slice(idx + 1);
                      });
                      setForm({ ...form, env });
                    }}
                    placeholder="GITHUB_TOKEN=ghp_xxx"
                    rows={3}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label>URL</label>
                  <input className="input" value={form.url || ""} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="http://localhost:8080/sse" />
                </div>
                <div className="form-group">
                  <label>请求头（KEY=VALUE，每行一个）</label>
                  <textarea
                    value={Object.entries(form.headers || {}).map(([k, v]) => `${k}=${v}`).join("\n")}
                    onChange={(e) => {
                      const headers: Record<string, string> = {};
                      e.target.value.split("\n").filter(Boolean).forEach((line) => {
                        const idx = line.indexOf("=");
                        if (idx > 0) headers[line.slice(0, idx)] = line.slice(idx + 1);
                      });
                      setForm({ ...form, headers });
                    }}
                    placeholder="Authorization=Bearer token"
                    rows={3}
                  />
                </div>
              </>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={() => setShowForm(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.startsWith("错误") ? "toast-error" : "toast-success"}`}>{toast}</div>}
    </div>
  );
}
