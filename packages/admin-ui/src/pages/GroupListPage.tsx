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

  if (loading) return <div className="empty-state"><p>Loading...</p></div>;

  return (
    <div>
      <div className="page-header">
        <h2>Group Configuration</h2>
        <p>Manage settings for Feishu group chats where the bot is active</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{groups.length} Group{groups.length !== 1 ? "s" : ""}</h3>
        </div>

        {groups.length === 0 ? (
          <div className="empty-state">
            <p>No group chats found. Groups appear here after the bot receives a message in a group.</p>
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
                    Prompt: <span className={`badge badge-${g.promptSource}`}>{g.promptSource}</span>
                    {" "}
                    @mention: {g.requireMention ? "required" : "not required"}
                  </span>
                </div>
                <div className="config-item-actions">
                  {g.hasConfig && <span className="badge badge-group">configured</span>}
                  <button className="btn btn-sm"><Settings size={12} /> Configure</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
