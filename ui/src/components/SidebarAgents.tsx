import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useDialogActions } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { useToastActions } from "../context/ToastContext";
import { agentsApi } from "../api/agents";
import { authApi } from "../api/auth";
import { heartbeatsApi } from "../api/heartbeats";
import { SIDEBAR_SCROLL_RESET_STATE } from "../lib/navigation-scroll";
import { queryKeys } from "../lib/queryKeys";
import { cn, agentRouteRef, agentUrl } from "../lib/utils";
import { useAgentOrder } from "../hooks/useAgentOrder";
import { groupAgentsByDepartment, type AgentDepartmentKey } from "../lib/agent-departments";
import { AgentIcon } from "./AgentIconPicker";
import { BudgetSidebarMarker } from "./BudgetSidebarMarker";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Agent } from "@paperclipai/shared";

const DEPARTMENT_CHROME: Record<
  AgentDepartmentKey,
  {
    accent: string;
    badge: string;
    border: string;
    dot: string;
    row: string;
    rowActive: string;
  }
> = {
  executive: {
    accent: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    badge: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
    border: "border-sky-500/20",
    dot: "bg-sky-400",
    row: "hover:border-sky-500/20 hover:bg-sky-500/6",
    rowActive: "border-sky-500/30 bg-sky-500/10 text-foreground shadow-sm shadow-sky-950/5",
  },
  productEngineering: {
    accent: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    badge: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    border: "border-violet-500/20",
    dot: "bg-violet-400",
    row: "hover:border-violet-500/20 hover:bg-violet-500/6",
    rowActive: "border-violet-500/30 bg-violet-500/10 text-foreground shadow-sm shadow-violet-950/5",
  },
  platformRuntime: {
    accent: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
    badge: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
    border: "border-cyan-500/20",
    dot: "bg-cyan-400",
    row: "hover:border-cyan-500/20 hover:bg-cyan-500/6",
    rowActive: "border-cyan-500/30 bg-cyan-500/10 text-foreground shadow-sm shadow-cyan-950/5",
  },
  dataDatabase: {
    accent: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    badge: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-500/20",
    dot: "bg-indigo-400",
    row: "hover:border-indigo-500/20 hover:bg-indigo-500/6",
    rowActive: "border-indigo-500/30 bg-indigo-500/10 text-foreground shadow-sm shadow-indigo-950/5",
  },
  qaTesting: {
    accent: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    badge: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
    border: "border-orange-500/20",
    dot: "bg-orange-400",
    row: "hover:border-orange-500/20 hover:bg-orange-500/6",
    rowActive: "border-orange-500/30 bg-orange-500/10 text-foreground shadow-sm shadow-orange-950/5",
  },
  finance: {
    accent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-500/20",
    dot: "bg-emerald-400",
    row: "hover:border-emerald-500/20 hover:bg-emerald-500/6",
    rowActive: "border-emerald-500/30 bg-emerald-500/10 text-foreground shadow-sm shadow-emerald-950/5",
  },
  peopleHr: {
    accent: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    badge: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    border: "border-rose-500/20",
    dot: "bg-rose-400",
    row: "hover:border-rose-500/20 hover:bg-rose-500/6",
    rowActive: "border-rose-500/30 bg-rose-500/10 text-foreground shadow-sm shadow-rose-950/5",
  },
  customerRevenue: {
    accent: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
    badge: "bg-pink-500/12 text-pink-700 dark:text-pink-300",
    border: "border-pink-500/20",
    dot: "bg-pink-400",
    row: "hover:border-pink-500/20 hover:bg-pink-500/6",
    rowActive: "border-pink-500/30 bg-pink-500/10 text-foreground shadow-sm shadow-pink-950/5",
  },
  assetsProcurement: {
    accent: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    badge: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    border: "border-amber-500/20",
    dot: "bg-amber-400",
    row: "hover:border-amber-500/20 hover:bg-amber-500/6",
    rowActive: "border-amber-500/30 bg-amber-500/10 text-foreground shadow-sm shadow-amber-950/5",
  },
  realEstate: {
    accent: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    badge: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
    border: "border-teal-500/20",
    dot: "bg-teal-400",
    row: "hover:border-teal-500/20 hover:bg-teal-500/6",
    rowActive: "border-teal-500/30 bg-teal-500/10 text-foreground shadow-sm shadow-teal-950/5",
  },
  governanceLegal: {
    accent: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
    badge: "bg-yellow-500/12 text-yellow-700 dark:text-yellow-300",
    border: "border-yellow-500/20",
    dot: "bg-yellow-400",
    row: "hover:border-yellow-500/20 hover:bg-yellow-500/6",
    rowActive: "border-yellow-500/30 bg-yellow-500/10 text-foreground shadow-sm shadow-yellow-950/5",
  },
  operations: {
    accent: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    badge: "bg-slate-500/12 text-slate-700 dark:text-slate-300",
    border: "border-slate-500/20",
    dot: "bg-slate-400",
    row: "hover:border-slate-500/20 hover:bg-slate-500/6",
    rowActive: "border-slate-500/30 bg-slate-500/10 text-foreground shadow-sm shadow-slate-950/5",
  },
  general: {
    accent: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
    badge: "bg-zinc-500/12 text-zinc-700 dark:text-zinc-300",
    border: "border-zinc-500/20",
    dot: "bg-zinc-400",
    row: "hover:border-zinc-500/20 hover:bg-zinc-500/6",
    rowActive: "border-zinc-500/30 bg-zinc-500/10 text-foreground shadow-sm shadow-zinc-950/5",
  },
};

export function SidebarAgents() {
  const [open, setOpen] = useState(true);
  const [openDepartments, setOpenDepartments] = useState<Record<string, boolean>>({});
  const [pendingAgentIds, setPendingAgentIds] = useState<Set<string>>(() => new Set());
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { openNewAgent } = useDialogActions();
  const { isMobile, setSidebarOpen } = useSidebar();
  const { pushToast } = useToastActions();
  const location = useLocation();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });

  const liveCountByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of liveRuns ?? []) {
      counts.set(run.agentId, (counts.get(run.agentId) ?? 0) + 1);
    }
    return counts;
  }, [liveRuns]);

  const visibleAgents = useMemo(() => {
    return (agents ?? []).filter((agent: Agent) => agent.status !== "terminated");
  }, [agents]);
  const currentUserId = session?.user?.id ?? session?.session?.userId ?? null;
  const { orderedAgents } = useAgentOrder({
    agents: visibleAgents,
    companyId: selectedCompanyId,
    userId: currentUserId,
  });

  const agentMatch = location.pathname.match(/^\/(?:[^/]+\/)?agents\/([^/]+)(?:\/([^/]+))?/);
  const activeAgentId = agentMatch?.[1] ?? null;
  const activeTab = agentMatch?.[2] ?? null;
  const groupedAgents = useMemo(() => groupAgentsByDepartment(orderedAgents), [orderedAgents]);

  useEffect(() => {
    setOpenDepartments((currentState) => {
      const nextState: Record<string, boolean> = {};
      let hasChanges = false;

      groupedAgents.forEach((group, index) => {
        const containsActiveAgent = group.agents.some(
          (agent) => agentRouteRef(agent) === activeAgentId,
        );
        const existingValue = currentState[group.key];
        const nextValue =
          containsActiveAgent || existingValue !== undefined ? existingValue ?? containsActiveAgent : index === 0;

        nextState[group.key] = containsActiveAgent ? true : nextValue;

        if (currentState[group.key] !== nextState[group.key]) {
          hasChanges = true;
        }
      });

      if (Object.keys(currentState).length !== Object.keys(nextState).length) {
        hasChanges = true;
      }

      return hasChanges ? nextState : currentState;
    });
  }, [activeAgentId, groupedAgents]);

  const pauseResumeAgent = useMutation({
    mutationFn: ({ agent, action }: { agent: Agent; action: "pause" | "resume" }) =>
      action === "pause"
        ? agentsApi.pause(agent.id, selectedCompanyId ?? undefined)
        : agentsApi.resume(agent.id, selectedCompanyId ?? undefined),
    onMutate: ({ agent }) => {
      setPendingAgentIds((current) => {
        const next = new Set(current);
        next.add(agent.id);
        return next;
      });
    },
    onSuccess: async (_agent, { agent, action }) => {
      if (selectedCompanyId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(selectedCompanyId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(selectedCompanyId) }),
        ]);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agentRouteRef(agent)) }),
      ]);
      pushToast({
        title: action === "pause" ? "Agent paused" : "Agent resumed",
        body: agent.name,
        tone: "success",
      });
    },
    onError: (error, { agent, action }) => {
      pushToast({
        title: action === "pause" ? "Could not pause agent" : "Could not resume agent",
        body: error instanceof Error ? error.message : agent.name,
        tone: "error",
      });
    },
    onSettled: (_data, _error, { agent }) => {
      setPendingAgentIds((current) => {
        const next = new Set(current);
        next.delete(agent.id);
        return next;
      });
    },
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="group">
        <div className="flex items-center px-3 py-1.5">
          <CollapsibleTrigger className="flex items-center gap-1 flex-1 min-w-0">
            <ChevronRight
              className={cn(
                "h-3 w-3 text-muted-foreground/60 transition-transform opacity-0 group-hover:opacity-100",
                open && "rotate-90",
              )}
            />
            <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
              Departments
            </span>
          </CollapsibleTrigger>
          <button
            onClick={(event) => {
              event.stopPropagation();
              openNewAgent();
            }}
            className="flex items-center justify-center h-4 w-4 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label="New agent"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      <CollapsibleContent>
        <div className="mt-1 flex flex-col gap-1.5">
          {groupedAgents.map((group) => {
            const chrome = DEPARTMENT_CHROME[group.key] ?? DEPARTMENT_CHROME.general;
            const containsActiveAgent = group.agents.some(
              (agent) => agentRouteRef(agent) === activeAgentId,
            );

            return (
              <Collapsible
                key={group.key}
                open={openDepartments[group.key] ?? false}
                onOpenChange={(nextOpen) => {
                  setOpenDepartments((currentState) => ({
                    ...currentState,
                    [group.key]: nextOpen,
                  }));
                }}
              >
                <CollapsibleTrigger
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow]",
                    chrome.border,
                    containsActiveAgent
                      ? "bg-background/90 shadow-sm"
                      : "bg-muted/35 hover:bg-muted/55",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-[10px] font-semibold uppercase tracking-[0.18em]",
                      chrome.accent,
                    )}
                  >
                    {group.shortLabel}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[12px] font-semibold text-foreground">
                        {group.label}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          chrome.badge,
                        )}
                      >
                        {group.agents.length}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {group.description}
                    </span>
                  </span>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      (openDepartments[group.key] ?? false) && "rotate-90",
                    )}
                  />
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className={cn("ml-4 mt-1.5 flex flex-col gap-1 border-l pl-3", chrome.border)}>
                    {group.agents.map((agent: Agent) => {
                      const runCount = liveCountByAgent.get(agent.id) ?? 0;
                      const isActiveAgent = activeAgentId === agentRouteRef(agent);
                      const href = activeTab ? `${agentUrl(agent)}/${activeTab}` : agentUrl(agent);
                      const editHref = `${agentUrl(agent)}/configuration`;
                      const isPaused = agent.status === "paused";
                      const isBudgetPaused = isPaused && agent.pauseReason === "budget";
                      const pending = pendingAgentIds.has(agent.id);
                      const pauseResumeDisabled = pending || agent.status === "pending_approval" || isBudgetPaused;
                      const pauseResumeDisabledLabel = pending
                        ? "Updating..."
                        : isBudgetPaused
                          ? "Budget paused"
                          : isPaused
                            ? "Resume agent"
                            : "Pause agent";

                      return (
                        <div key={agent.id} className="group/agent relative flex items-center">
                          <NavLink
                            to={href}
                            state={SIDEBAR_SCROLL_RESET_STATE}
                            onClick={() => {
                              if (isMobile) setSidebarOpen(false);
                            }}
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-3 py-2 pr-9 text-[13px] transition-[border-color,background-color,color,box-shadow]",
                              isActiveAgent
                                ? chrome.rowActive
                                : cn("border-transparent text-foreground/80", chrome.row),
                            )}
                          >
                            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", chrome.dot)} />
                            <AgentIcon
                              icon={agent.icon}
                              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{agent.name}</span>
                              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                                {agent.title ?? agent.role}
                              </span>
                            </span>
                            {(agent.pauseReason === "budget" || runCount > 0) && (
                              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                                {agent.pauseReason === "budget" ? (
                                  <BudgetSidebarMarker title="Agent paused by budget" />
                                ) : null}
                                {runCount > 0 ? (
                                  <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-blue-400 opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                                  </span>
                                ) : null}
                                {runCount > 0 ? (
                                  <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                    {runCount}
                                  </span>
                                ) : null}
                              </span>
                            )}
                          </NavLink>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className={cn(
                                  "absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 transition-opacity data-[state=open]:pointer-events-auto data-[state=open]:opacity-100",
                                  isMobile
                                    ? "opacity-100"
                                    : "pointer-events-none opacity-0 group-hover/agent:pointer-events-auto group-hover/agent:opacity-100 group-focus-within/agent:pointer-events-auto group-focus-within/agent:opacity-100",
                                )}
                                aria-label={`Open actions for ${agent.name}`}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem asChild>
                                <Link
                                  to={editHref}
                                  onClick={() => {
                                    if (isMobile) setSidebarOpen(false);
                                  }}
                                >
                                  <Pencil className="size-4" />
                                  <span>Edit agent</span>
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  if (pauseResumeDisabled) return;
                                  pauseResumeAgent.mutate({ agent, action: isPaused ? "resume" : "pause" });
                                }}
                                disabled={pauseResumeDisabled}
                                title={isBudgetPaused ? "Agent was paused by budget limits" : undefined}
                              >
                                {isPaused ? <PlayCircle className="size-4" /> : <PauseCircle className="size-4" />}
                                <span>{pauseResumeDisabledLabel}</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
