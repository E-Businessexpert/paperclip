import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Building2,
  FileText,
  MessageSquare,
  Search,
  Users,
  Waypoints,
  Workflow,
} from "lucide-react";
import type { EnterpriseGraphLink } from "@paperclipai/shared";
import { agentsApi, type AgentDirectoryEntry } from "@/api/agents";
import { issuesApi } from "@/api/issues";
import { AgentIcon } from "@/components/AgentIconPicker";
import { EmptyState } from "@/components/EmptyState";
import { MarkdownBody } from "@/components/MarkdownBody";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Link } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { agentUrl, cn, issueUrl } from "@/lib/utils";

type WorkspaceAgent = AgentDirectoryEntry & {
  linked: boolean;
};

function filterAgent(agent: WorkspaceAgent, query: string) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [agent.name, agent.companyName ?? "", agent.role ?? "", agent.urlKey ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function AgentChatTR() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [search, setSearch] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "AgentChatTR" }]);
  }, [setBreadcrumbs]);

  const directoryQuery = useQuery({
    queryKey: selectedCompanyId
      ? [...queryKeys.agents.listGlobal, selectedCompanyId, "agentchattr-directory"]
      : ["agents", "agentchattr-directory", "none"],
    queryFn: async () => {
      if (!selectedCompanyId) return [] as AgentDirectoryEntry[];
      try {
        return await agentsApi.listGlobal();
      } catch {
        const agents = await agentsApi.list(selectedCompanyId);
        return agents.map((agent) => ({
          ...agent,
          companyName: selectedCompany?.name ?? null,
        }));
      }
    },
    enabled: !!selectedCompanyId,
  });

  const enterpriseGraphQuery = useQuery({
    queryKey: selectedCompanyId
      ? [...queryKeys.enterpriseGraph(selectedCompanyId), "agentchattr"]
      : ["enterprise-graph", "agentchattr", "none"],
    queryFn: async () => {
      if (!selectedCompanyId) return null;
      try {
        return await agentsApi.enterpriseGraph(selectedCompanyId);
      } catch {
        return null;
      }
    },
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const scoped = new Map<string, WorkspaceAgent>();
    const linkedIds = new Set((enterpriseGraphQuery.data?.nodes ?? []).map((node) => node.id));

    for (const agent of directoryQuery.data ?? []) {
      const isCompanyAgent = agent.companyId === selectedCompanyId;
      const isLinkedAgent = linkedIds.has(agent.id);
      if (!isCompanyAgent && !isLinkedAgent) continue;
      scoped.set(agent.id, {
        ...agent,
        companyName:
          agent.companyName ??
          (agent.companyId === selectedCompanyId ? selectedCompany?.name ?? null : null),
        linked: agent.companyId !== selectedCompanyId,
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
        linked: (node.companyId ?? existing?.companyId) !== selectedCompanyId,
      });
    }

    return scoped;
  }, [directoryQuery.data, enterpriseGraphQuery.data, selectedCompany?.name, selectedCompanyId]);

  const scopedAgents = useMemo(() => {
    return Array.from(agentMap.values()).sort((left, right) => {
      if (left.linked !== right.linked) return left.linked ? 1 : -1;
      return left.name.localeCompare(right.name);
    });
  }, [agentMap]);

  const visibleAgents = useMemo(
    () => scopedAgents.filter((agent) => filterAgent(agent, search)),
    [scopedAgents, search],
  );

  const defaultAgentId = useMemo(() => {
    const localRoot =
      enterpriseGraphQuery.data?.roots.find((root) => root.companyId === selectedCompanyId)?.id ??
      enterpriseGraphQuery.data?.roots[0]?.id ??
      null;
    return localRoot ?? scopedAgents[0]?.id ?? null;
  }, [enterpriseGraphQuery.data?.roots, scopedAgents, selectedCompanyId]);

  useEffect(() => {
    if (!scopedAgents.length) {
      setSelectedAgentId(null);
      return;
    }
    if (selectedAgentId && agentMap.has(selectedAgentId)) return;
    setSelectedAgentId(defaultAgentId);
  }, [agentMap, defaultAgentId, scopedAgents.length, selectedAgentId]);

  const selectedAgent = selectedAgentId ? agentMap.get(selectedAgentId) ?? null : null;
  const selectedAgentCompanyId = selectedAgent?.companyId ?? selectedCompanyId ?? null;
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

  const assignedIssuesQuery = useQuery({
    queryKey:
      selectedAgent && selectedAgentCompanyId
        ? ["agentchattr", "issues", selectedAgentCompanyId, selectedAgent.id]
        : ["agentchattr", "issues", "none"],
    queryFn: async () => {
      if (!selectedAgent || !selectedAgentCompanyId) return [];
      try {
        return await issuesApi.list(selectedAgentCompanyId, {
          assigneeAgentId: selectedAgent.id,
          limit: 18,
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

  const currentDashboard = resolveCompanyDashboard(selectedCompany?.name, null);
  const executiveRoom = executiveRoomForDashboard(currentDashboard);
  const relayRoom = relayRoomForDashboard(currentDashboard);

  const fallbackChatroomContent = useMemo(() => {
    if (!selectedAgent) return "";
    return buildFallbackAgentChatroom({
      agentName: selectedAgent.name,
      companyName: selectedAgent.companyName ?? selectedCompany?.name ?? null,
      teamName: null,
      reportsToName,
      dashboard: resolveCompanyDashboard(
        selectedAgent.companyName ?? selectedCompany?.name,
        null,
      ),
    });
  }, [reportsToName, selectedAgent, selectedCompany?.name]);

  const chatroomContent = chatroomFileQuery.data?.content ?? fallbackChatroomContent;
  const parsedChatroom = useMemo(
    () => (chatroomContent ? parseAgentChatroom(chatroomContent) : null),
    [chatroomContent],
  );
  const selectedTeamName =
    typeof parsedChatroom?.frontmatter.team === "string" ? parsedChatroom.frontmatter.team : null;

  const selectedDashboard = resolveCompanyDashboard(
    selectedAgent?.companyName ?? selectedCompany?.name,
    typeof parsedChatroom?.frontmatter.dashboard === "string"
      ? parsedChatroom.frontmatter.dashboard
      : null,
  );

  if (directoryQuery.isLoading && scopedAgents.length === 0) {
    return <PageSkeleton variant="detail" />;
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={MessageSquare} message="Select a company to open AgentChatTR." />;
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
            <h1 className="text-2xl font-semibold tracking-tight">AgentChatTR</h1>
            <Badge variant="outline">{selectedCompany?.name ?? "Company board"}</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Live communication boards for the current company scope. This view uses each
            agent&apos;s managed <code>CHATROOM.md</code> when it exists and falls back to a generated
            board when it does not.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Dashboard</div>
            <div className="mt-1 text-sm font-medium">{currentDashboard}</div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Company Agents</div>
            <div className="mt-1 text-sm font-medium">
              {scopedAgents.filter((agent) => !agent.linked).length}
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
                  All current-company agents plus linked cross-company contacts in this board scope.
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
                      onClick={() => setSelectedAgentId(agent.id)}
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
                      <Badge variant="outline">
                        {typeof parsedChatroom?.frontmatter.primaryRoom === "string"
                          ? parsedChatroom.frontmatter.primaryRoom
                          : teamRoomForName(selectedTeamName)}
                      </Badge>
                      {reportsToName ? (
                        <Badge variant="secondary">Reports to {reportsToName}</Badge>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                      <Link to={agentUrl(selectedAgent)}>
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
                            teamRoomForName(selectedTeamName),
                            executiveRoomForDashboard(selectedDashboard),
                            relayRoomForDashboard(selectedDashboard),
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
