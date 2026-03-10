import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Settings } from "lucide-react";

export function GroupListPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.getGroups().then(({ groups }) => setGroups(groups)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty-state"><p>加载中...</p></div>;

  return (
    <div>
      <div className="page-header">
        <h2>群组配置</h2>
        <p>管理机器人所在飞书群聊的配置</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{groups.length} 个群组</h3>
        </div>

        {groups.length === 0 ? (
          <div className="empty-state">
            <p>未找到群聊。机器人在群中收到消息后，群组会自动出现在这里。</p>
          </div>
        ) : (
          <div className="config-list">
            {groups.map((g) => (
              <div
                key={g.chatId}
                className="config-item"
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/groups/${g.chatId}`)}
              >
                <div className="config-item-info">
                  <span className="config-item-name">{g.chatId}</span>
                  <span className="config-item-desc">
                    提示词：<span className={`badge badge-${g.promptSource}`}>{g.promptSource}</span>
                    {" "}
                    @提及：{g.requireMention ? "必须" : "非必须"}
                  </span>
                </div>
                <div className="config-item-actions">
                  {g.hasConfig && <span className="badge badge-group">已配置</span>}
                  <button className="btn btn-sm"><Settings size={12} /> 配置</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
