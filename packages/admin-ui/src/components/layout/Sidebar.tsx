import { NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { LayoutDashboard, MessageSquare, Plug, Zap, Users, Settings } from "lucide-react";

export function Sidebar() {
  const { user } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Minister</h1>
        <p>管理面板</p>
      </div>

      <div className="sidebar-section">个人配置</div>
      <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <LayoutDashboard />
        总览
      </NavLink>
      <NavLink to="/prompt" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <MessageSquare />
        系统提示词
      </NavLink>
      <NavLink to="/mcp" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <Plug />
        MCP 服务器
      </NavLink>
      <NavLink to="/skills" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <Zap />
        技能
      </NavLink>

      <div className="sidebar-section">群组</div>
      <NavLink to="/groups" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <Users />
        群组配置
      </NavLink>

      <NavLink to="/system" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <Settings />
        系统默认值
      </NavLink>

      {user && (
        <div className="user-info">
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt="" className="user-avatar" />
            : <div className="user-avatar" />
          }
          <div>
            <div className="user-name">{user.name || "用户"}</div>
            <div className="user-id">{user.openId.slice(0, 16)}...</div>
          </div>
        </div>
      )}
    </aside>
  );
}
