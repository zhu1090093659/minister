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
      showToast(`技能 "/${name}" 已保存`);
    } catch (err: any) {
      showToast("错误：" + err.message);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`确定删除技能 "/${name}"？`)) return;
    try {
      await api.deleteUserSkill(name);
      await loadSkills();
      showToast(`技能 "/${name}" 已删除`);
    } catch (err: any) {
      showToast("错误：" + err.message);
    }
  }

  async function handleToggle(name: string, enabled: boolean) {
    try {
      await api.toggleUserSkill(name, enabled);
      setSkills((s) => s.map((sk) => sk.name === name ? { ...sk, enabled } : sk));
    } catch (err: any) {
      showToast("错误：" + err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>技能</h2>
        <p>管理通过 /{"{name}"} 在对话中调用的自定义技能</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{skills.length} 个技能</h3>
          <button className="btn btn-sm btn-primary" onClick={openNew}><Plus size={14} /> 创建技能</button>
        </div>

        {skills.length === 0 ? (
          <div className="empty-state"><p>暂无技能</p></div>
        ) : (
          <div className="config-list">
            {skills.map((s) => (
              <div key={s.name} className="config-item">
                <div className="config-item-info">
                  <span className="config-item-name">/{s.name}</span>
                  {s.description && <span className="config-item-desc">{s.description}</span>}
                </div>
                <div className="config-item-actions">
                  {s.isBuiltin && <span className="badge badge-builtin">内置</span>}
                  <div
                    className={`toggle ${s.enabled ? "active" : ""}`}
                    onClick={() => handleToggle(s.name, !s.enabled)}
                    title={s.enabled ? "禁用" : "启用"}
                  />
                  <button className="btn btn-sm" onClick={() => openEdit(s.name)}><Eye size={12} /> 查看</button>
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
            <h3>{editSkill.isNew ? "创建技能" : `编辑 /${editSkill.name}`}</h3>

            {editSkill.isNew && (
              <div className="form-group">
                <label>技能名称（小写字母，可用连字符）</label>
                <input
                  className="input"
                  value={editSkill.name}
                  onChange={(e) => setEditSkill({ ...editSkill, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                  placeholder="weekly-report"
                />
              </div>
            )}

            <div className="form-group">
              <label>SKILL.md 内容</label>
              <textarea
                value={editSkill.content}
                onChange={(e) => setEditSkill({ ...editSkill, content: e.target.value })}
                rows={20}
                style={{ fontFamily: '"SF Mono", "Fira Code", monospace', fontSize: 12.5 }}
              />
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setShowEditor(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast ${toast.startsWith("错误") ? "toast-error" : "toast-success"}`}>{toast}</div>}
    </div>
  );
}
