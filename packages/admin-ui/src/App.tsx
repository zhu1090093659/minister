import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthContext, type User } from "@/lib/auth";
import { api } from "@/lib/api";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { PromptPage } from "@/pages/PromptPage";
import { McpPage } from "@/pages/McpPage";
import { SkillsPage } from "@/pages/SkillsPage";
import { GroupListPage } from "@/pages/GroupListPage";
import { GroupConfigPage } from "@/pages/GroupConfigPage";
import { SystemPage } from "@/pages/SystemPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <AuthContext.Provider value={{ user, loading: false }}>
      {children}
    </AuthContext.Provider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="prompt" element={<PromptPage />} />
          <Route path="mcp" element={<McpPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="groups" element={<GroupListPage />} />
          <Route path="groups/:chatId" element={<GroupConfigPage />} />
          <Route path="system" element={<SystemPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
