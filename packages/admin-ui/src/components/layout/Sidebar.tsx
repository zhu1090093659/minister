import { NavLink } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { LayoutDashboard, MessageSquare, Plug, Zap, Users, Settings } from "lucide-react";

export function Sidebar() {
  const { user } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Minister</h1>
        <p>Admin Panel</p>
      </div>

      <div className="sidebar-section">Personal</div>
      <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <LayoutDashboard />
        Overview
      </NavLink>
      <NavLink to="/prompt" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <MessageSquare />
        System Prompt
      </NavLink>
      <NavLink to="/mcp" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <Plug />
        MCP Servers
      </NavLink>
      <NavLink to="/skills" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <Zap />
        Skills
      </NavLink>

      <div className="sidebar-section">Groups</div>
      <NavLink to="/groups" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <Users />
        Group Config
      </NavLink>

      <NavLink to="/system" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
        <Settings />
        System Defaults
      </NavLink>

      {user && (
        <div className="user-info">
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt="" className="user-avatar" />
            : <div className="user-avatar" />
          }
          <div>
            <div className="user-name">{user.name || "User"}</div>
            <div className="user-id">{user.openId.slice(0, 16)}...</div>
          </div>
        </div>
      )}
    </aside>
  );
}
