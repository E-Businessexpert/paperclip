import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Building2,
  FileText,
  MessageSquare,
  Search,
  Send,
  Users,
  Waypoints,
  Workflow,
} from "lucide-react";
import type { Company, EnterpriseGraphLink, Issue, IssueComment } from "@paperclipai/shared";
import { agentsApi, type AgentDirectoryEntry } from "@/api/agents";
import { issuesApi } from "@/api/issues";
import { AgentIcon } from "@/components/AgentIconPicker";
import { EmptyState } from "@/components/EmptyState";
import { MarkdownBody } from "@/components/MarkdownBody";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import {
  buildFallbackAgentChatroom,
  executiveRoomForDashboard,
  findChatroomPath,
  parseAgentChatroom,
  relayRoomForDashboard,
  resolveCompanyDashboard,
  teamRoomForName,
} from "@/lib/agent-chattr";
import { Link, useSearchParams } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { agentUrl, cn, issueUrl } from "@/lib/utils";

type WorkspaceAgent = AgentDirectoryEntry & {
  linked: boolean;
};

type AgentChatTRScope = "company" | "global";

interface AgentChatTRProps {
  scope?: AgentChatTRScope;
}

interface AgentChatroomCard {
  room: string;
  label: string;
  description: string;
}

const AGENT_CHATTR_TITLE_PREFIX = "[AgentChatTR]";

function buildConversationTitle(agentName: string, room: string) {
  return `${AGENT_CHATTR_TITLE_PREFIX} ${room} - ${agentName}`;
}

function buildConversationDescription(params: {
  agent: WorkspaceAgent;
  companyName?: string | null;
  dashboard: string;
  room: string;
}) {
  return [
    "AgentChatTR live conversation thread.",
    "",
    `AgentChatTR-Agent-ID: ${params.agent.id}`,
    `AgentChatTR-Agent: ${params.agent.name}`,
    `AgentChatTR-Room: ${params.room}`,
    `AgentChatTR-Dashboard: ${params.dashboard}`,
    `AgentChatTR-Company: ${params.companyName ?? params.agent.companyName ?? "Unknown company"}`,
    "",
    "Messages in this issue are the durable chat history for this room.",
  ].join("\n");
}

function isAgentChatTRConversation(issue: Issue, agent: WorkspaceAgent, room: string) {
  const description = issue.description ?? "";
  if (
    description.includes(`AgentChatTR-Agent-ID: ${agent.id}`) &&
    description.includes(`AgentChatTR-Room: ${room}`)
  ) {
    return true;
  }
  return (
    issue.assigneeAgentId === agent.id &&
    issue.title.startsWith(AGENT_CHATTR_TITLE_PREFIX) &&
    issue.title.includes(room)
  );
}

function formatChatTimestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function commentAuthorLabel(comment: IssueComment, selectedAgent: WorkspaceAgent) {
  if (comment.authorAgentId === selectedAgent.id) return selectedAgent.name;
  if (comment.authorType === "agent") return "Agent";
  if (comment.authorType === "system") return "System";
  return "You";
}

function findGlobalSeedCompany(companies: Company[], selectedCompany: Company | null) {
  const activeCompanies = companies.filter((company) => company.status !== "archived");
  return (
    activeCompanies.find((company) =>
      company.issuePrefix.toUpperCase() === "FAM" ||
      /family\s+trust|trust/i.test(company.name),
    ) ??
    selectedCompany ??
    activeCompanies[0] ??
    companies[0] ??
    null
  );
}

function agentCompanyHref(agent: AgentDirectoryEntry, companiesById: Map<string, Company>) {
  const prefix = companiesById.get(agent.companyId)?.issuePrefix;
  const path = agentUrl(agent);
  return prefix ? `/${prefix}${path}` : path;
}

function trustOwnerPriority(agent: WorkspaceAgent, seedCompanyId: string | null) {
  if (seedCompanyId && agent.companyId !== seedCompanyId) return 0;
  const haystack = [agent.name, agent.title ?? "", agent.role, agent.capabilities ?? ""]
    .join(" ")
    .toLowerCase();
  if (haystack.includes("trust steward")) return 5;
  if (haystack.includes("trust owner")) return 4;
  if (haystack.includes("ceo") || haystack.includes("chief executive")) return 3;
  if (haystack.includes("owner")) return 2;
  if (haystack.includes("trust")) return 1;
  return 0;
}

function filterAgent(agent: WorkspaceAgent, query: string) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [agent.name, agent.companyName ?? "", agent.role ?? "", agent.urlKey ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function AgentChatTR({ scope = "company" }: AgentChatTRProps = {}) {
  const { companies, selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [createdConversations, setCreatedConversations] = useState<Record<string, Issue>>({});
  const isGlobalScope = scope === "global";
  const requestedAgentId = (searchParams.get("agentId") ?? searchParams.get("agent") ?? "").trim() || null;
  const globalSeedCompany = useMemo(
    () => findGlobalSeedCompany(companies, selectedCompany),
    [companies, selectedCompany],
  );
  const boardCompany = isGlobalScope ? globalSeedCompany : selectedCompany;
  const boardCompanyId = boardCompany?.id ?? null;
  const enterpriseScope = isGlobalScope ? "family" : "company";
  const companiesById = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies],
  );

  useEffect(() => {
    setBreadcrumbs([{ label: isGlobalScope ? "Global AgentChatTR" : "Company AgentChatTR" }]);
  }, [isGlobalScope, setBreadcrumbs]);

  const directoryQuery = useQuery({
    queryKey: boardCompanyId
      ? [...queryKeys.agents.listGlobal, boardCompanyId, scope, "agentchattr-directory"]
      : ["agents", "agentchattr-directory", "none"],
    queryFn: async () => {
      if (!boardCompanyId) return [] as AgentDirectoryEntry[];
      try {
        return await agentsApi.listGlobal();
      } catch {
        const agents = await agentsApi.list(boardCompanyId);
        return agents.map((agent) => ({
          ...agent,
          companyName: boardCompany?.name ?? null,
        }));
      }
    },
    enabled: !!boardCompanyId,
  });

  const enterpriseGraphQuery = useQuery({
    queryKey: boardCompanyId
      ? [...queryKeys.enterpriseGraph(boardCompanyId, enterpriseScope), "agentchattr"]
      : ["enterprise-graph", "agentchattr", "none"],
    queryFn: async () => {
      if (!boardCompanyId) return null;
      try {
        return await agentsApi.enterpriseGraph(boardCompanyId, enterpriseScope);
      } catch {
        return null;
      }
    },
    enabled: !!boardCompanyId,
  });

  const agentMap = useMemo(() => {
    const scoped = new Map<string, WorkspaceAgent>();
    const linkedIds = new Set((enterpriseGraphQuery.data?.nodes ?? []).map((node) => node.id));

    for (const agent of directoryQuery.data ?? []) {
      const isCompanyAgent = agent.companyId === boardCompanyId;
      const isLinkedAgent = linkedIds.has(agent.id);
      if (!isGlobalScope && !isCompanyAgent && !isLinkedAgent) continue;
      scoped.set(agent.id, {
        ...agent,
        companyName:
          agent.companyName ??
          (agent.companyId === boardCompanyId ? boardCompany?.name ?? null : null),
        linked: agent.companyId !== boardCompanyId,
      });
    }

    for (const node of enterpriseGraphQuery.data?.nodes ?? []) {
      const existing = scoped.get(node.id);
      scoped.set(node.id, {
        ...(existing ?? node),
        id: node.id,
        name: node.name,
        role: node.role,
        status: node.status,
        companyId: node.companyId ?? existing?.companyId,
        companyName: node.companyName ?? existing?.companyName ?? null,
        linked: (node.companyId ?? existing?.companyId) !== boardCompanyId,
      });
    }

    return scoped;
  }, [boardCompany?.name, boardCompanyId, directoryQuery.data, enterpriseGraphQuery.data, isGlobalScope]);

  const scopedAgents = useMemo(() => {
    return Array.from(agentMap.values()).sort((left, right) => {
      if (left.linked !== right.linked) return left.linked ? 1 : -1;
      if (isGlobalScope) {
        const companyDelta = (left.companyName ?? "").localeCompare(right.companyName ?? "");
        if (companyDelta !== 0) return companyDelta;
      }
      return left.name.localeCompare(right.name);
    });
  }, [agentMap, isGlobalScope]);

  const visibleAgents = useMemo(
    () => scopedAgents.filter((agent) => filterAgent(agent, search)),
    [scopedAgents, search],
  );

  const selectAgent = useCallback(
    (nextAgentId: string) => {
      setSelectedAgentId(nextAgentId);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("agentId", nextAgentId);
          next.delete("agent");
          return next;
        },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  const defaultAgentId = useMemo(() => {
    if (isGlobalScope) {
      const trustOwner = scopedAgents.reduce<{ agent: WorkspaceAgent | null; priority: number }>(
        (best, agent) => {
          const priority = trustOwnerPriority(agent, boardCompanyId);
          return priority > best.priority ? { agent, priority } : best;
        },
        { agent: null, priority: 0 },
      );
      if (trustOwner.agent) return trustOwner.agent.id;
    }
    const localRoot =
      enterpriseGraphQuery.data?.roots.find((root) => root.companyId === boardCompanyId)?.id ??
      enterpriseGraphQuery.data?.roots[0]?.id ??
      null;
    return localRoot ?? scopedAgents[0]?.id ?? null;
  }, [boardCompanyId, enterpriseGraphQuery.data?.roots, isGlobalScope, scopedAgents]);

  useEffect(() => {
    if (!scopedAgents.length) {
      setSelectedAgentId(null);
      return;
    }
    if (requestedAgentId && agentMap.has(requestedAgentId)) {
      if (selectedAgentId !== requestedAgentId) {
        setSelectedAgentId(requestedAgentId);
      }
      return;
    }
    if (selectedAgentId && agentMap.has(selectedAgentId)) return;
    setSelectedAgentId(defaultAgentId);
  }, [agentMap, defaultAgentId, requestedAgentId, scopedAgents.length, selectedAgentId]);

  const selectedAgent = selectedAgentId ? agentMap.get(selectedAgentId) ?? null : null;
  const selectedAgentCompanyId = selectedAgent?.companyId ?? boardCompanyId ?? null;
  const reportsToName =
    (selectedAgent?.reportsTo ? agentMap.get(selectedAgent.reportsTo)?.name : null) ?? null;

  const instructionsBundleQuery = useQuery({
    queryKey:
      selectedAgent && selectedAgentCompanyId
        ? [queryKeys.agents.instructionsBundle(selectedAgent.id), selectedAgentCompanyId, "agentchattr"]
        : ["agentchattr", "bundle", "none"],
    queryFn: async () => {
      if (!selectedAgent || !selectedAgentCompanyId) return null;
      try {
        return await agentsApi.instructionsBundle(selectedAgent.id, selectedAgentCompanyId);
      } catch {
        return null;
      }
    },
    enabled: !!selectedAgent && !!selectedAgentCompanyId,
  });

  const chatroomPath = useMemo(
    () => findChatroomPath(instructionsBundleQuery.data),
    [instructionsBundleQuery.data],
  );

  const chatroomFileQuery = useQuery({
    queryKey:
      selectedAgent && selectedAgentCompanyId && chatroomPath
        ? [queryKeys.agents.instructionsFile(selectedAgent.id, chatroomPath), selectedAgentCompanyId, "agentchattr"]
        : ["agentchattr", "chatroom-file", "none"],
    queryFn: async () => {
      if (!selectedAgent || !selectedAgentCompanyId || !chatroomPath) return null;
      try {
        return await agentsApi.instructionsFile(selectedAgent.id, chatroomPath, selectedAgentCompanyId);
      } catch {
        return null;
      }
    },
    enabled: !!selectedAgent && !!selectedAgentCompanyId && !!chatroomPath,
  });

  const assignedIssuesQueryKey =
    selectedAgent && selectedAgentCompanyId
      ? ["agentchattr", "issues", selectedAgentCompanyId, selectedAgent.id] as const
      : ["agentchattr", "issues", "none"] as const;
  const assignedIssuesQuery = useQuery({
    queryKey: assignedIssuesQueryKey,
    queryFn: async () => {
      if (!selectedAgent || !selectedAgentCompanyId) return [];
      try {
        return await issuesApi.list(selectedAgentCompanyId, {
          assigneeAgentId: selectedAgent.id,
          limit: 100,
        });
      } catch {
        return [];
      }
    },
    enabled: !!selectedAgent && !!selectedAgentCompanyId,
  });

  const workflowPacks = enterpriseGraphQuery.data?.workflowPacks ?? [];
  const selectedRelationships = useMemo(() => {
    if (!selectedAgent) return [] as EnterpriseGraphLink[];
    return (enterpriseGraphQuery.data?.links ?? []).filter(
      (link) =>
        link.sourceAgentId === selectedAgent.id || link.targetAgentId === selectedAgent.id,
    );
  }, [enterpriseGraphQuery.data?.links, selectedAgent]);

  const currentDashboard = resolveCompanyDashboard(boardCompany?.name, null);
  const executiveRoom = executiveRoomForDashboard(currentDashboard);
  const relayRoom = relayRoomForDashboard(currentDashboard);

  const fallbackChatroomContent = useMemo(() => {
    if (!selectedAgent) return "";
    return buildFallbackAgentChatroom({
      agentName: selectedAgent.name,
      companyName: selectedAgent.companyName ?? boardCompany?.name ?? null,
      teamName: null,
      reportsToName,
      dashboard: resolveCompanyDashboard(
        selectedAgent.companyName ?? boardCompany?.name,
        null,
      ),
    });
  }, [boardCompany?.name, reportsToName, selectedAgent]);

  const chatroomContent = chatroomFileQuery.data?.content ?? fallbackChatroomContent;
  const parsedChatroom = useMemo(
    () => (chatroomContent ? parseAgentChatroom(chatroomContent) : null),
    [chatroomContent],
  );
  const selectedTeamName =
    typeof parsedChatroom?.frontmatter.team === "string" ? parsedChatroom.frontmatter.team : null;

  const selectedDashboard = resolveCompanyDashboard(
    selectedAgent?.companyName ?? boardCompany?.name,
    typeof parsedChatroom?.frontmatter.dashboard === "string"
      ? parsedChatroom.frontmatter.dashboard
      : null,
  );
  const primaryRoom =
    typeof parsedChatroom?.frontmatter.primaryRoom === "string"
      ? parsedChatroom.frontmatter.primaryRoom
      : teamRoomForName(selectedTeamName);
  const executiveRoomForSelectedAgent = executiveRoomForDashboard(selectedDashboard);
  const relayRoomForSelectedAgent = relayRoomForDashboard(selectedDashboard);
  const chatroomCards = useMemo<AgentChatroomCard[]>(() => {
    const rooms = new Map<string, AgentChatroomCard>();
    const addRoom = (room: string, label: string, description: string) => {
      if (!room || rooms.has(room)) return;
      rooms.set(room, { room, label, description });
    };

    addRoom(primaryRoom, "Primary room", "Default working room for this agent and team.");
    addRoom(executiveRoomForSelectedAgent, "Executive room", "Upward reporting and manager escalation room.");
    addRoom(relayRoomForSelectedAgent, "Relay room", "Cross-company relay room for handoffs and dependencies.");
    for (const room of parsedChatroom?.roomAccess ?? []) {
      addRoom(room, "Managed room", "Room declared by the agent's managed CHATROOM.md.");
    }
    return Array.from(rooms.values());
  }, [executiveRoomForSelectedAgent, parsedChatroom?.roomAccess, primaryRoom, relayRoomForSelectedAgent]);

  useEffect(() => {
    if (!selectedAgent || chatroomCards.length === 0) {
      setActiveRoom(null);
      setDraftMessage("");
      return;
    }
    if (!activeRoom || !chatroomCards.some((card) => card.room === activeRoom)) {
      setActiveRoom(chatroomCards[0]?.room ?? null);
      setDraftMessage("");
    }
  }, [activeRoom, chatroomCards, selectedAgent]);

  const activeRoomCard = useMemo(
    () => chatroomCards.find((card) => card.room === activeRoom) ?? chatroomCards[0] ?? null,
    [activeRoom, chatroomCards],
  );
  const conversationKey = selectedAgent && activeRoomCard
    ? `${selectedAgent.id}:${activeRoomCard.room}`
    : null;
  const roomConversationIssue = useMemo(() => {
    if (!selectedAgent || !activeRoomCard || !conversationKey) return null;
    return (
      createdConversations[conversationKey] ??
      assignedIssuesQuery.data?.find((issue) =>
        isAgentChatTRConversation(issue, selectedAgent, activeRoomCard.room),
      ) ??
      null
    );
  }, [activeRoomCard, assignedIssuesQuery.data, conversationKey, createdConversations, selectedAgent]);

  const conversationCommentsQuery = useQuery({
    queryKey: roomConversationIssue
      ? queryKeys.issues.comments(roomConversationIssue.id)
      : ["agentchattr", "comments", "none"],
    queryFn: async () => {
      if (!roomConversationIssue) return [];
      try {
        return await issuesApi.listComments(roomConversationIssue.id, {
          order: "asc",
          limit: 100,
        });
      } catch {
        return [];
      }
    },
    enabled: !!roomConversationIssue,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const body = draftMessage.trim();
      if (!body) throw new Error("Message is required");
      if (!selectedAgent || !selectedAgentCompanyId || !activeRoomCard) {
        throw new Error("Select an agent and room before sending a message");
      }

      const issue =
        roomConversationIssue ??
        await issuesApi.create(selectedAgentCompanyId, {
          title: buildConversationTitle(selectedAgent.name, activeRoomCard.room),
          description: buildConversationDescription({
            agent: selectedAgent,
            companyName: selectedAgent.companyName ?? boardCompany?.name ?? null,
            dashboard: selectedDashboard,
            room: activeRoomCard.room,
          }),
          assigneeAgentId: selectedAgent.id,
          priority: "medium",
          status: "todo",
          workMode: "standard",
        });
      const comment = await issuesApi.addComment(issue.id, body, true);
      return { issue, comment };
    },
    onSuccess: async ({ issue }) => {
      if (conversationKey) {
        setCreatedConversations((current) => ({
          ...current,
          [conversationKey]: issue,
        }));
      }
      setDraftMessage("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: assignedIssuesQueryKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issue.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issue.id) }),
      ]);
    },
  });

  if (directoryQuery.isLoading && scopedAgents.length === 0) {
    return <PageSkeleton variant="detail" />;
  }

  if (!boardCompanyId) {
    return (
      <EmptyState
        icon={MessageSquare}
        message={
          isGlobalScope
            ? "Create a company before opening Global AgentChatTR."
            : "Select a company to open Company AgentChatTR."
        }
      />
    );
  }

  if (!scopedAgents.length) {
    return (
      <EmptyState
        icon={Users}
        message="No agents are available in this board scope yet."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isGlobalScope ? "Global AgentChatTR" : "Company AgentChatTR"}
            </h1>
            <Badge variant="outline">
              {isGlobalScope ? "All visible companies" : boardCompany?.name ?? "Company board"}
            </Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {isGlobalScope
              ? "CEO/trust-owner command board across every visible agent. Open any agent's managed chatroom without losing company boundaries."
              : "Live communication boards for the current company scope. This view uses each agent's managed CHATROOM.md when it exists and falls back to a generated board when it does not."}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Dashboard</div>
            <div className="mt-1 text-sm font-medium">{currentDashboard}</div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {isGlobalScope ? "Visible Agents" : "Company Agents"}
            </div>
            <div className="mt-1 text-sm font-medium">
              {isGlobalScope ? scopedAgents.length : scopedAgents.filter((agent) => !agent.linked).length}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Workflow Packs</div>
            <div className="mt-1 text-sm font-medium">{workflowPacks.length}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px,minmax(0,1fr),360px]">
        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Agent Directory</h2>
                <p className="text-xs text-muted-foreground">
                  {isGlobalScope
                    ? "All visible agents across the enterprise, grouped by their real company."
                    : "All current-company agents plus linked cross-company contacts in this board scope."}
                </p>
              </div>
              <Badge variant="outline">{visibleAgents.length}</Badge>
            </div>
            <div className="mt-3 relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search agent, company, or role"
                className="pl-9"
              />
            </div>
          </div>
          <div className="max-h-[calc(100vh-18rem)] overflow-y-auto">
            {visibleAgents.length === 0 ? (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                No agents matched the current search.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {visibleAgents.map((agent) => {
                  const isSelected = agent.id === selectedAgentId;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => selectAgent(agent.id)}
                      className={cn(
                        "w-full px-4 py-3 text-left transition-colors hover:bg-accent/50",
                        isSelected && "bg-accent/60",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                          <AgentIcon icon={agent.icon} className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">{agent.name}</span>
                            {agent.linked ? (
                              <Badge variant="secondary">Linked</Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {agent.role}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <Badge variant="outline">{agent.companyName ?? "Unknown company"}</Badge>
                            {agent.status ? (
                              <Badge variant="outline" className="capitalize">
                                {agent.status}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          {selectedAgent ? (
            <>
              <div className="rounded-xl border border-border bg-card">
                <div className="flex flex-col gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <AgentIcon icon={selectedAgent.icon} className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-xl font-semibold">{selectedAgent.name}</h2>
                        <p className="text-sm text-muted-foreground">{selectedAgent.role}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline">{selectedAgent.companyName ?? "Unknown company"}</Badge>
                      <Badge variant="outline">{selectedDashboard}</Badge>
                      <Badge variant="outline">{primaryRoom}</Badge>
                      {reportsToName ? (
                        <Badge variant="secondary">Reports to {reportsToName}</Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                      <Link to={agentCompanyHref(selectedAgent, companiesById)}>
                        Open Agent
                        <ArrowUpRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      Company routing
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Executive room</div>
                        <div className="mt-1 font-medium">{executiveRoomForDashboard(selectedDashboard)}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Relay room</div>
                        <div className="mt-1 font-medium">{relayRoomForDashboard(selectedDashboard)}</div>
                      </div>
                      {reportsToName ? (
                        <div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Supervisor</div>
                          <div className="mt-1 font-medium">{reportsToName}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Waypoints className="h-4 w-4 text-muted-foreground" />
                      Room access
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(parsedChatroom?.roomAccess.length
                        ? parsedChatroom.roomAccess
                        : [
                            primaryRoom,
                            executiveRoomForSelectedAgent,
                            relayRoomForSelectedAgent,
                          ].filter((room, index, list) => list.indexOf(room) === index)
                      ).map((room) => (
                        <Badge key={room} variant="outline">
                          {room}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Managed source
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Mode</div>
                        <div className="mt-1 font-medium">
                          {instructionsBundleQuery.data?.mode ?? "fallback"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Board file</div>
                        <div className="mt-1 break-all font-medium">
                          {chatroomPath ?? "Generated fallback board"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border px-5 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        Chat mode
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Pick a room, read the durable message thread, and send a comment that wakes the assigned agent.
                      </p>
                    </div>
                    <Badge variant="outline">
                      {roomConversationIssue ? "Issue-backed room" : "Ready to start"}
                    </Badge>
                  </div>
                  {!chatroomFileQuery.data ? (
                    <div className="mt-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/30 dark:text-amber-200">
                      Generated fallback rooms: no managed <code>CHATROOM.md</code> file was found for this agent yet.
                    </div>
                  ) : null}
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {chatroomCards.map((card) => (
                      <button
                        key={card.room}
                        type="button"
                        aria-pressed={activeRoomCard?.room === card.room}
                        onClick={() => setActiveRoom(card.room)}
                        className={cn(
                          "rounded-lg border bg-background p-3 text-left transition hover:border-primary/60 hover:bg-accent/40",
                          activeRoomCard?.room === card.room
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                            : "border-border",
                        )}
                      >
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {card.label}
                        </div>
                        <div className="mt-1 break-all font-mono text-sm font-semibold">
                          {card.room}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {card.description}
                        </p>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-xl border border-border bg-background">
                    <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          {activeRoomCard?.room ?? "Select a room"}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {roomConversationIssue
                            ? `Conversation issue ${roomConversationIssue.identifier ?? roomConversationIssue.id}`
                            : "No messages yet. Your first send will create the conversation issue for this room."}
                        </p>
                      </div>
                      {roomConversationIssue ? (
                        <Button variant="outline" size="sm" asChild>
                          <Link to={issueUrl(roomConversationIssue)}>
                            Open issue
                            <ArrowUpRight className="ml-1 h-4 w-4" />
                          </Link>
                        </Button>
                      ) : null}
                    </div>

                    <div className="max-h-[420px] min-h-[240px] space-y-3 overflow-y-auto px-4 py-4">
                      {!roomConversationIssue ? (
                        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-center">
                          <div>
                            <div className="text-sm font-medium">Start talking in this room</div>
                            <p className="mt-1 max-w-md text-xs text-muted-foreground">
                              Type a message below. Paperclip will create an AgentChatTR conversation issue, assign it to {selectedAgent.name}, and store this room's chat history there.
                            </p>
                          </div>
                        </div>
                      ) : conversationCommentsQuery.isLoading ? (
                        <div className="text-sm text-muted-foreground">Loading room messages...</div>
                      ) : conversationCommentsQuery.data?.length ? (
                        conversationCommentsQuery.data.map((comment) => {
                          const isSelectedAgent = comment.authorAgentId === selectedAgent.id;
                          const authorLabel = commentAuthorLabel(comment, selectedAgent);
                          return (
                            <div
                              key={comment.id}
                              className={cn("flex", isSelectedAgent ? "justify-start" : "justify-end")}
                            >
                              <div
                                className={cn(
                                  "max-w-[82%] rounded-2xl border px-4 py-3 text-sm shadow-sm",
                                  isSelectedAgent
                                    ? "border-border bg-card"
                                    : "border-primary/30 bg-primary/10",
                                )}
                              >
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                                  <span>{authorLabel}</span>
                                  <span>{formatChatTimestamp(comment.createdAt)}</span>
                                </div>
                                <MarkdownBody children={comment.body} />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-center">
                          <div>
                            <div className="text-sm font-medium">No messages in this room yet</div>
                            <p className="mt-1 max-w-md text-xs text-muted-foreground">
                              Send the first message below to wake {selectedAgent.name}.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <form
                      className="border-t border-border p-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!draftMessage.trim() || sendMessageMutation.isPending) return;
                        sendMessageMutation.mutate();
                      }}
                    >
                      <Textarea
                        value={draftMessage}
                        onChange={(event) => setDraftMessage(event.target.value)}
                        placeholder={`Message ${selectedAgent.name} in ${activeRoomCard?.room ?? "this room"}`}
                        className="min-h-24 resize-y"
                      />
                      {sendMessageMutation.error instanceof Error ? (
                        <div className="mt-2 text-sm text-destructive">
                          {sendMessageMutation.error.message}
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground">
                          Sends as an issue comment and wakes the assigned agent through the existing Paperclip flow.
                        </p>
                        <Button
                          type="submit"
                          disabled={!draftMessage.trim() || sendMessageMutation.isPending || !activeRoomCard}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          {sendMessageMutation.isPending ? "Sending..." : "Send to agent"}
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),320px]">
                <div className="rounded-xl border border-border bg-card">
                  <div className="border-b border-border px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Live communication board</h3>
                        <p className="text-xs text-muted-foreground">
                          Managed <code>CHATROOM.md</code> content for the selected agent.
                        </p>
                      </div>
                      {!chatroomFileQuery.data ? (
                        <Badge variant="secondary">Generated fallback</Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="max-h-[calc(100vh-26rem)] overflow-y-auto px-5 py-5">
                    <MarkdownBody children={chatroomContent} />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Workflow className="h-4 w-4 text-muted-foreground" />
                      Current working board
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      {(parsedChatroom?.currentBoard.length
                        ? parsedChatroom.currentBoard
                        : [
                            { label: "Status", value: selectedAgent.status ?? "" },
                            { label: "Workflow Mode In Use", value: "" },
                            { label: "Next Upward Report", value: "" },
                          ]
                      ).map((entry) => (
                        <div key={entry.label} className="rounded-md border border-border bg-background px-3 py-2">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {entry.label}
                          </div>
                          <div className="mt-1 min-h-5 text-sm">
                            {entry.value || <span className="text-muted-foreground">Not set</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Assigned issues
                    </div>
                    <div className="mt-3 space-y-2">
                      {assignedIssuesQuery.isLoading ? (
                        <div className="text-sm text-muted-foreground">Loading assigned work...</div>
                      ) : assignedIssuesQuery.data?.length ? (
                        assignedIssuesQuery.data.map((issue) => (
                          <Link
                            key={issue.id}
                            to={issueUrl(issue)}
                            className="block rounded-md border border-border bg-background px-3 py-2 transition-colors hover:bg-accent/40"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">
                                  {issue.identifier ?? issue.id}
                                </div>
                                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {issue.title}
                                </div>
                              </div>
                              <Badge variant="outline" className="capitalize">
                                {issue.status}
                              </Badge>
                            </div>
                          </Link>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          No assigned issues are visible for this agent right now.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              icon={MessageSquare}
              message="Select an agent to open the chatroom board."
            />
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Workflow className="h-4 w-4 text-muted-foreground" />
              Workflow packs
            </div>
            <div className="mt-3 space-y-3">
              {workflowPacks.length ? (
                workflowPacks.map((pack) => (
                  <div key={pack.key} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{pack.label}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{pack.description}</div>
                      </div>
                      <Badge variant="outline">{pack.stageLabels.length}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {pack.relationshipTypeKeys.slice(0, 6).map((typeKey) => (
                        <Badge key={typeKey} variant="secondary">
                          {typeKey}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">
                  No workflow packs were returned for this company board.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Waypoints className="h-4 w-4 text-muted-foreground" />
              Relationship links
            </div>
            <div className="mt-3 space-y-2">
              {selectedRelationships.length ? (
                selectedRelationships.map((relationship) => {
                  const otherAgentId =
                    relationship.sourceAgentId === selectedAgentId
                      ? relationship.targetAgentId
                      : relationship.sourceAgentId;
                  const otherAgent = agentMap.get(otherAgentId);
                  return (
                    <div
                      key={relationship.id}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium">{relationship.typeLabel}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {otherAgent?.name ?? relationship.targetAgentName ?? "Linked agent"}
                          </div>
                        </div>
                        <Badge variant="outline">{relationship.category}</Badge>
                      </div>
                      {relationship.notes ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {relationship.notes}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-muted-foreground">
                  No secondary enterprise links are attached to the selected agent.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Board routing
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Executive room</div>
                <div className="mt-1 font-medium">{executiveRoom}</div>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Relay room</div>
                <div className="mt-1 font-medium">{relayRoom}</div>
              </div>
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Linked contacts</div>
                <div className="mt-1 font-medium">
                  {scopedAgents.filter((agent) => agent.linked).length}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
