import type {
  Agent,
  AgentDetail,
  AgentEnterpriseRelationshipsRecord,
  AgentEnterpriseRelationshipsView,
  EnterpriseGraphOrgNode,
  EnterpriseGraphView,
  AgentInstructionsBundle,
  AgentInstructionsFileDetail,
  AgentSkillSnapshot,
  AdapterEnvironmentTestResult,
  AgentKeyCreated,
  AgentRuntimeState,
  AgentTaskSession,
  AgentWakeupResponse,
  HeartbeatRun,
  Approval,
  AgentConfigRevision,
} from "@paperclipai/shared";
import { isUuidLike, normalizeAgentUrlKey } from "@paperclipai/shared";
import { ApiError, api } from "./client";

export interface AgentKey {
  id: string;
  name: string;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface AdapterModel {
  id: string;
  label: string;
}

export interface DetectedAdapterModel {
  model: string;
  provider: string;
  source: string;
  candidates?: string[];
}

export interface ClaudeLoginResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  loginUrl: string | null;
  stdout: string;
  stderr: string;
}

export interface AgentDirectoryEntry extends Agent {
  companyName?: string | null;
}

export type OrgNode = EnterpriseGraphOrgNode;

export interface AgentHireResponse {
  agent: Agent;
  approval: Approval | null;
}

export interface AgentPermissionUpdate {
  canCreateAgents: boolean;
  canAssignTasks: boolean;
  canDesignOrganizations?: boolean;
  canManageRelationshipTypes?: boolean;
  canManageServiceDiscovery?: boolean;
  canManageDeploymentAssignments?: boolean;
  canGenerateSystemTopology?: boolean;
}

export interface AgentEnterpriseRelationshipsUpdateResponse {
  agentId: string;
  companyId: string;
  projectId: string | null;
  enterpriseRelationships: AgentEnterpriseRelationshipsView;
}

function withCompanyScope(path: string, companyId?: string) {
  if (!companyId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}companyId=${encodeURIComponent(companyId)}`;
}

function agentPath(id: string, companyId?: string, suffix = "") {
  return withCompanyScope(`/agents/${encodeURIComponent(id)}${suffix}`, companyId);
}

export const agentsApi = {
  list: (companyId: string) => api.get<Agent[]>(`/companies/${companyId}/agents`),
  listGlobal: () => api.get<AgentDirectoryEntry[]>("/instance/agents"),
  org: (companyId: string) => api.get<OrgNode[]>(`/companies/${companyId}/org`),
  enterpriseGraph: (companyId: string, scope: "company" | "family" = "company") =>
    api.get<EnterpriseGraphView>(
      `/companies/${companyId}/enterprise-graph${scope === "family" ? "?scope=family" : ""}`,
    ),
  listConfigurations: (companyId: string) =>
    api.get<Record<string, unknown>[]>(`/companies/${companyId}/agent-configurations`),
  get: async (id: string, companyId?: string) => {
    try {
      return await api.get<AgentDetail>(agentPath(id, companyId));
    } catch (error) {
      // Shortname lookups are company-scoped on the backend. If the route points at
      // the wrong company prefix, fall back to the visible global directory so the UI
      // can recover to the agent's canonical company context.
      if (
        !(error instanceof ApiError) ||
        !companyId ||
        isUuidLike(id)
      ) {
        throw error;
      }

      const urlKey = normalizeAgentUrlKey(id);
      if (!urlKey) throw error;

      if (error.status === 409) {
        const agents = await api.get<Agent[]>(`/companies/${companyId}/agents`);
        const matches = agents.filter(
          (agent) => agent.status !== "terminated" && normalizeAgentUrlKey(agent.urlKey ?? agent.name ?? agent.id) === urlKey,
        );
        if (matches.length === 1) {
          return api.get<AgentDetail>(agentPath(matches[0]!.id, companyId));
        }
        throw error;
      }

      if (error.status !== 404) {
        throw error;
      }

      try {
        const visibleAgents = await api.get<AgentDirectoryEntry[]>("/instance/agents");
        const visibleMatches = visibleAgents.filter(
          (agent) =>
            agent.status !== "terminated"
            && normalizeAgentUrlKey(agent.urlKey ?? agent.name ?? agent.id) === urlKey,
        );
        const exactCompanyMatch = visibleMatches.find((agent) => agent.companyId === companyId);
        const fallbackMatch = exactCompanyMatch ?? (visibleMatches.length === 1 ? visibleMatches[0] : null);
        if (!fallbackMatch) throw error;
        return api.get<AgentDetail>(agentPath(fallbackMatch.id, fallbackMatch.companyId ?? companyId));
      } catch {
        throw error;
      }
    }
  },
  getConfiguration: (id: string, companyId?: string) =>
    api.get<Record<string, unknown>>(agentPath(id, companyId, "/configuration")),
  listConfigRevisions: (id: string, companyId?: string) =>
    api.get<AgentConfigRevision[]>(agentPath(id, companyId, "/config-revisions")),
  getConfigRevision: (id: string, revisionId: string, companyId?: string) =>
    api.get<AgentConfigRevision>(agentPath(id, companyId, `/config-revisions/${revisionId}`)),
  rollbackConfigRevision: (id: string, revisionId: string, companyId?: string) =>
    api.post<Agent>(agentPath(id, companyId, `/config-revisions/${revisionId}/rollback`), {}),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Agent>(`/companies/${companyId}/agents`, data),
  hire: (companyId: string, data: Record<string, unknown>) =>
    api.post<AgentHireResponse>(`/companies/${companyId}/agent-hires`, data),
  update: (id: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<Agent>(agentPath(id, companyId), data),
  updatePermissions: (id: string, data: AgentPermissionUpdate, companyId?: string) =>
    api.patch<AgentDetail>(agentPath(id, companyId, "/permissions"), data),
  updateEnterpriseRelationships: (
    id: string,
    data: {
      projectId?: string | null;
      source?: string | null;
      relationships: AgentEnterpriseRelationshipsRecord | null;
    },
    companyId?: string,
  ) =>
    api.put<AgentEnterpriseRelationshipsUpdateResponse>(
      agentPath(id, companyId, "/enterprise-relationships"),
      data,
    ),
  instructionsBundle: (id: string, companyId?: string) =>
    api.get<AgentInstructionsBundle>(agentPath(id, companyId, "/instructions-bundle")),
  updateInstructionsBundle: (
    id: string,
    data: {
      mode?: "managed" | "external";
      rootPath?: string | null;
      entryFile?: string;
      clearLegacyPromptTemplate?: boolean;
    },
    companyId?: string,
  ) => api.patch<AgentInstructionsBundle>(agentPath(id, companyId, "/instructions-bundle"), data),
  instructionsFile: (id: string, relativePath: string, companyId?: string) =>
    api.get<AgentInstructionsFileDetail>(
      agentPath(id, companyId, `/instructions-bundle/file?path=${encodeURIComponent(relativePath)}`),
    ),
  saveInstructionsFile: (
    id: string,
    data: { path: string; content: string; clearLegacyPromptTemplate?: boolean },
    companyId?: string,
  ) => api.put<AgentInstructionsFileDetail>(agentPath(id, companyId, "/instructions-bundle/file"), data),
  deleteInstructionsFile: (id: string, relativePath: string, companyId?: string) =>
    api.delete<AgentInstructionsBundle>(
      agentPath(id, companyId, `/instructions-bundle/file?path=${encodeURIComponent(relativePath)}`),
    ),
  pause: (id: string, companyId?: string) => api.post<Agent>(agentPath(id, companyId, "/pause"), {}),
  resume: (id: string, companyId?: string) => api.post<Agent>(agentPath(id, companyId, "/resume"), {}),
  terminate: (id: string, companyId?: string) => api.post<Agent>(agentPath(id, companyId, "/terminate"), {}),
  remove: (id: string, companyId?: string) => api.delete<{ ok: true }>(agentPath(id, companyId)),
  listKeys: (id: string, companyId?: string) => api.get<AgentKey[]>(agentPath(id, companyId, "/keys")),
  skills: (id: string, companyId?: string) =>
    api.get<AgentSkillSnapshot>(agentPath(id, companyId, "/skills")),
  syncSkills: (id: string, desiredSkills: string[], companyId?: string) =>
    api.post<AgentSkillSnapshot>(agentPath(id, companyId, "/skills/sync"), { desiredSkills }),
  createKey: (id: string, name: string, companyId?: string) =>
    api.post<AgentKeyCreated>(agentPath(id, companyId, "/keys"), { name }),
  revokeKey: (agentId: string, keyId: string, companyId?: string) =>
    api.delete<{ ok: true }>(agentPath(agentId, companyId, `/keys/${encodeURIComponent(keyId)}`)),
  runtimeState: (id: string, companyId?: string) =>
    api.get<AgentRuntimeState>(agentPath(id, companyId, "/runtime-state")),
  taskSessions: (id: string, companyId?: string) =>
    api.get<AgentTaskSession[]>(agentPath(id, companyId, "/task-sessions")),
  resetSession: (id: string, taskKey?: string | null, companyId?: string) =>
    api.post<void>(agentPath(id, companyId, "/runtime-state/reset-session"), { taskKey: taskKey ?? null }),
  adapterModels: (companyId: string, type: string) =>
    api.get<AdapterModel[]>(
      `/companies/${encodeURIComponent(companyId)}/adapters/${encodeURIComponent(type)}/models`,
    ),
  detectModel: (companyId: string, type: string) =>
    api.get<DetectedAdapterModel | null>(
      `/companies/${encodeURIComponent(companyId)}/adapters/${encodeURIComponent(type)}/detect-model`,
    ),
  testEnvironment: (
    companyId: string,
    type: string,
    data: { adapterConfig: Record<string, unknown> },
  ) =>
    api.post<AdapterEnvironmentTestResult>(
      `/companies/${companyId}/adapters/${type}/test-environment`,
      data,
    ),
  invoke: (id: string, companyId?: string) => api.post<HeartbeatRun>(agentPath(id, companyId, "/heartbeat/invoke"), {}),
  wakeup: (
    id: string,
    data: {
      source?: "timer" | "assignment" | "on_demand" | "automation";
      triggerDetail?: "manual" | "ping" | "callback" | "system";
      reason?: string | null;
      payload?: Record<string, unknown> | null;
      idempotencyKey?: string | null;
    },
    companyId?: string,
  ) => api.post<AgentWakeupResponse>(agentPath(id, companyId, "/wakeup"), data),
  loginWithClaude: (id: string, companyId?: string) =>
    api.post<ClaudeLoginResult>(agentPath(id, companyId, "/claude-login"), {}),
  availableSkills: () =>
    api.get<{ skills: AvailableSkill[] }>("/skills/available"),
};

export interface AvailableSkill {
  name: string;
  description: string;
  isPaperclipManaged: boolean;
}
