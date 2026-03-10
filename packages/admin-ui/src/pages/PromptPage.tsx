import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function PromptPage() {
  const [data, setData] = useState<{ customPrompt: string | null; defaultPrompt: string; source: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.getUserPrompt().then((d) => {
      setData(d);
      setDraft(d.customPrompt ?? "");
    });
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await api.updateUserPrompt(draft);
      setData((d) => d ? { ...d, customPrompt: draft, source: "user" } : d);
      showToast("提示词已保存");
    } catch (err: any) {
      showToast("错误：" + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    try {
      await api.deleteUserPrompt();
      setDraft("");
      setData((d) => d ? { ...d, customPrompt: null, source: "system" } : d);
      showToast("已恢复为系统默认值");
    } catch (err: any) {
      showToast("错误：" + err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <div className="empty-state"><p>加载中...</p></div>;

  return (
    <div>
      <div className="page-header">
        <h2>系统提示词</h2>
        <p>为你的个人 AI 助手自定义系统提示词</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>当前来源：<span className={`badge badge-${data.source}`}>{data.source}</span></h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={handleReset} disabled={saving || !data.customPrompt}>
              恢复默认
            </button>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || !draft.trim()}>
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>自定义系统提示词</label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="在此输入自定义系统提示词...留空则使用系统默认值。"
            rows={16}
          />
        </div>

        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", color: "var(--text-secondary)", fontSize: 13 }}>
            查看系统默认值
          </summary>
          <pre style={{
            marginTop: 8,
            padding: 16,
            background: "var(--bg)",
            borderRadius: "var(--radius)",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            maxHeight: 300,
            overflow: "auto",
            color: "var(--text-muted)",
          }}>
            {data.defaultPrompt}
          </pre>
        </details>
      </div>

      {toast && <div className={`toast ${toast.startsWith("错误") ? "toast-error" : "toast-success"}`}>{toast}</div>}
    </div>
  );
}
