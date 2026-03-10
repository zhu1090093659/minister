// API client — typed fetch wrapper for admin backend
const BASE = "/api/v1";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    credentials: "include",
  });

  if (res.status === 401) {
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  getFeishuUrl: (redirectUri?: string) =>
    request<{ url: string }>(`/auth/feishu-url${redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : ""}`),
  getMe: () => request<{ openId: string; name?: string; avatarUrl?: string }>("/auth/me"),

  // User config
  getUserConfig: () => request<any>("/user/config"),
  getUserPrompt: () => request<any>("/user/prompt"),
  updateUserPrompt: (prompt: string) => request<any>("/user/prompt", { method: "PUT", body: JSON.stringify({ prompt }) }),
  deleteUserPrompt: () => request<any>("/user/prompt", { method: "DELETE" }),

  getUserMcp: () => request<{ servers: Record<string, any> }>("/user/mcp"),
  updateUserMcp: (name: string, config: any) => request<any>(`/user/mcp/${name}`, { method: "PUT", body: JSON.stringify(config) }),
  deleteUserMcp: (name: string) => request<any>(`/user/mcp/${name}`, { method: "DELETE" }),
  testUserMcp: (name: string) => request<any>(`/user/mcp/${name}/test`, { method: "POST" }),

  getUserSkills: () => request<{ skills: any[] }>("/user/skills"),
  getUserSkill: (name: string) => request<any>(`/user/skills/${name}`),
  updateUserSkill: (name: string, content: string) => request<any>(`/user/skills/${name}`, { method: "PUT", body: JSON.stringify({ content }) }),
  deleteUserSkill: (name: string) => request<any>(`/user/skills/${name}`, { method: "DELETE" }),
  toggleUserSkill: (name: string, enabled: boolean) => request<any>(`/user/skills/${name}/toggle`, { method: "PATCH", body: JSON.stringify({ enabled }) }),

  getUserMemory: () => request<{ content: string }>("/user/memory"),
  updateUserMemory: (content: string) => request<any>("/user/memory", { method: "PUT", body: JSON.stringify({ content }) }),

  // Groups
  getGroups: () => request<{ groups: any[] }>("/groups"),
  getGroupConfig: (chatId: string) => request<any>(`/groups/${chatId}/config`),
  updateGroupPrompt: (chatId: string, prompt: string) => request<any>(`/groups/${chatId}/prompt`, { method: "PUT", body: JSON.stringify({ prompt }) }),
  deleteGroupPrompt: (chatId: string) => request<any>(`/groups/${chatId}/prompt`, { method: "DELETE" }),
  getGroupBehavior: (chatId: string) => request<any>(`/groups/${chatId}/behavior`),
  updateGroupBehavior: (chatId: string, behavior: any) => request<any>(`/groups/${chatId}/behavior`, { method: "PUT", body: JSON.stringify({ behavior }) }),
  getGroupMcp: (chatId: string) => request<{ servers: Record<string, any> }>(`/groups/${chatId}/mcp`),
  updateGroupMcp: (chatId: string, name: string, config: any) => request<any>(`/groups/${chatId}/mcp/${name}`, { method: "PUT", body: JSON.stringify(config) }),
  deleteGroupMcp: (chatId: string, name: string) => request<any>(`/groups/${chatId}/mcp/${name}`, { method: "DELETE" }),
  getGroupSkills: (chatId: string) => request<{ skills: any[] }>(`/groups/${chatId}/skills`),
  updateGroupSkill: (chatId: string, name: string, content: string) => request<any>(`/groups/${chatId}/skills/${name}`, { method: "PUT", body: JSON.stringify({ content }) }),
  deleteGroupSkill: (chatId: string, name: string) => request<any>(`/groups/${chatId}/skills/${name}`, { method: "DELETE" }),

  // System
  getSystemDefaults: () => request<any>("/system/defaults"),
  getSkillTemplates: () => request<{ templates: any[] }>("/system/skill-templates"),
};
