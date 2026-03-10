import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, Eye } from "lucide-react";

interface Skill {
  name: string;
  description?: string;
  enabled: boolean;
  isBuiltin: boolean;
}

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editSkill, setEditSkill] = useState<{ name: string; content: string; isNew: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { loadSkills(); }, []);

  async function loadSkills() {
    const { skills } = await api.getUserSkills();
    setSkills(skills);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function openNew() {
    setEditSkill({ name: "", content: `---\nname: my-skill\ndescription: Describe what this skill does\n---\n\n# Instructions\n\nAdd your skill instructions here.\n`, isNew: true });
    setShowEditor(true);
  }

  async function openEdit(name: string) {
    try {
      const data = await api.getUserSkill(name);
      setEditSkill({ name, content: data.content, isNew: false });
      setShowEditor(true);
    } catch (err: any) {
      showToast("Error: " + err.message);
    }
  }

  async function handleSave() {
    if (!editSkill) return;
    const name = editSkill.isNew ? editSkill.name : editSkill.name;
    if (!name || !editSkill.content) return;
    try {
      await api.updateUserSkill(name, editSkill.content);
      await loadSkills();
      setShowEditor(false);
      showToast(`Skill "/${name}" saved`);
    } catch (err: any) {
      showToast("Error: " + err.message);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete skill "/${name}"?`)) return;
    try {
      await api.deleteUserSkill(name);
      await loadSkills();
      showToast(`Skill "/${name}" deleted`);
    } catch (err: any) {
      showToast("Error: " + err.message);
    }
  }

  async function handleToggle(name: string, enabled: boolean) {
    try {
      await api.toggleUserSkill(name, enabled);
      setSkills((s) => s.map((sk) => sk.name === name ? { ...sk, enabled } : sk));
    } catch (err: any) {
      showToast("Error: " + err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Skills</h2>
        <p>Manage custom skills invoked via /{"{name}"} in conversations</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{skills.length} Skill{skills.length !== 1 ? "s" : ""}</h3>
          <button className="btn btn-sm btn-primary" onClick={openNew}><Plus size={14} /> Create Skill</button>
        </div>

        {skills.length === 0 ? (
          <div className="empty-state"><p>No skills yet</p></div>
        ) : (
          <div className="config-list">
            {skills.map((s) => (
              <div key={s.name} className="config-item">
                <div className="config-item-info">
                  <span className="config-item-name">/{s.name}</span>
                  {s.description && <span className="config-item-desc">{s.description}</span>}
                </div>
                <div className="config-item-actions">
                  {s.isBuiltin && <span className="badge badge-builtin">built-in</span>}
                  <div
                    className={`toggle ${s.enabled ? "active" : ""}`}
                    onClick={() => handleToggle(s.name, !s.enabled)}
                    title={s.enabled ? "Disable" : "Enable"}
                  />
                  <button className="btn btn-sm" onClick={() => openEdit(s.name)}><Eye size={12} /> View</button>
                  {!s.isBuiltin && (
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s.name)}><Trash2 size={12} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEditor && editSkill && (
        <div className="modal-overlay" onClick={() => setShowEditor(false)}>
          <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
            <h3>{editSkill.isNew ? "Create Skill" : `Edit /${editSkill.name}`}</h3>

            {editSkill.isNew && (
              <div className="form-group">
                <label>Skill Name (lowercase, hyphens OK)</label>
                <input
                  className="input"
                  value={editSkill.name}
                  onChange={(e) => setEditSkill({ ...editSkill, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                  placeholder="weekly-report"
                />
              </div>
            )}

            <div className="form-group">
              <label>SKILL.md Content</label>
              <textarea
                value={editSkill.content}
                onChange={(e) => setEditSkill({ ...editSkill, content: e.target.value })}
                rows={20}
                style={{ fontFamily: '"SF Mono", "Fira Code", monospace', fontSize: 12.5 }}
              />
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setShowEditor(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.startsWith("Error") ? "toast-error" : "toast-success"}`}>{toast}</div>}
    </div>
  );
}
