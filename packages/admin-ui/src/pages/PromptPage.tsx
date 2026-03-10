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
      showToast("Prompt saved");
    } catch (err: any) {
      showToast("Error: " + err.message);
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
      showToast("Reset to system default");
    } catch (err: any) {
      showToast("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <div className="empty-state"><p>Loading...</p></div>;

  return (
    <div>
      <div className="page-header">
        <h2>System Prompt</h2>
        <p>Customize the system prompt for your personal AI assistant</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Current Source: <span className={`badge badge-${data.source}`}>{data.source}</span></h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" onClick={handleReset} disabled={saving || !data.customPrompt}>
              Reset to Default
            </button>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || !draft.trim()}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Custom System Prompt</label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Enter your custom system prompt here... Leave empty to use system default."
            rows={16}
          />
        </div>

        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", color: "var(--text-secondary)", fontSize: 13 }}>
            View System Default
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

      {toast && <div className={`toast ${toast.startsWith("Error") ? "toast-error" : "toast-success"}`}>{toast}</div>}
    </div>
  );
}
