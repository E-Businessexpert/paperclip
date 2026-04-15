import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, GitBranch, Network, Upload, Workflow } from "lucide-react";
import {
  AGENT_ROLE_LABELS,
  type EnterpriseGraphLink,
  type EnterpriseGraphNode,
  type EnterpriseRelationshipCategory,
  type EnterpriseWorkflowPackDefinition,
} from "@paperclipai/shared";
import { Link, useNavigate } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { agentsApi, type AgentDirectoryEntry, type OrgNode } from "../api/agents";
import { getAdapterLabel } from "../adapters/adapter-display-registry";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl } from "../lib/utils";

const CARD_W = 200;
const CARD_H = 100;
const GAP_X = 32;
const GAP_Y = 80;
const PADDING = 60;

type OrgViewMode = "hierarchy" | "enterprise";

interface LayoutNode {
  id: string;
  name: string;
  role: string;
  status: string;
  companyId?: string;
  companyName?: string | null;
  externalToCompany?: boolean;
  x: number;
  y: number;
  children: LayoutNode[];
}

interface SecondaryEdge extends EnterpriseGraphLink {
  path: string;
}

const relationshipCategoryLabels: Record<EnterpriseRelationshipCategory, string> = {
  matrix: "Matrix",
  delivery: "Delivery",
  decision: "Decision",
  service: "Service",
  asset: "Asset",
  data: "Data",
  governance: "Governance",
  finance: "Finance",
  communication: "Communication",
  custom: "Custom",
};

const relationshipCategoryStroke: Record<EnterpriseRelationshipCategory, string> = {
  matrix: "#60a5fa",
  delivery: "#34d399",
  decision: "#f59e0b",
  service: "#22c55e",
  asset: "#8b5cf6",
  data: "#06b6d4",
  governance: "#f97316",
  finance: "#eab308",
  communication: "#ec4899",
  custom: "#94a3b8",
};

const statusDotColor: Record<string, string> = {
  running: "#22d3ee",
  active: "#4ade80",
  paused: "#facc15",
  idle: "#facc15",
  error: "#f87171",
  terminated: "#a3a3a3",
};

const defaultDotColor = "#a3a3a3";
const roleLabels: Record<string, string> = AGENT_ROLE_LABELS;

function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}

function subtreeWidth(node: OrgNode): number {
  if (node.reports.length === 0) return CARD_W;
  const childrenW = node.reports.reduce(
    (sum: number, child: OrgNode) => sum + subtreeWidth(child),
    0,
  );
  const gaps = (node.reports.length - 1) * GAP_X;
  return Math.max(CARD_W, childrenW + gaps);
}

function layoutTree(node: OrgNode, x: number, y: number): LayoutNode {
  const totalW = subtreeWidth(node);
  const children: LayoutNode[] = [];

  if (node.reports.length > 0) {
    const childrenW = node.reports.reduce(
      (sum: number, child: OrgNode) => sum + subtreeWidth(child),
      0,
    );
    const gaps = (node.reports.length - 1) * GAP_X;
    let cursorX = x + (totalW - childrenW - gaps) / 2;

    for (const child of node.reports) {
      const childWidth = subtreeWidth(child);
      children.push(layoutTree(child, cursorX, y + CARD_H + GAP_Y));
      cursorX += childWidth + GAP_X;
    }
  }

  return {
    id: node.id,
    name: node.name,
    role: node.role,
    status: node.status,
    companyId: node.companyId,
    companyName: node.companyName,
    externalToCompany: node.externalToCompany,
    x: x + (totalW - CARD_W) / 2,
    y,
    children,
  };
}

function layoutForest(roots: OrgNode[]): LayoutNode[] {
  if (roots.length === 0) return [];

  let x = PADDING;
  const result: LayoutNode[] = [];
  for (const root of roots) {
    const width = subtreeWidth(root);
    result.push(layoutTree(root, x, PADDING));
    x += width + GAP_X;
  }
  return result;
}

function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  const walk = (node: LayoutNode) => {
    result.push(node);
    node.children.forEach(walk);
  };
  nodes.forEach(walk);
  return result;
}

function collectEdges(nodes: LayoutNode[]): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const edges: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  const walk = (node: LayoutNode) => {
    for (const child of node.children) {
      edges.push({ parent: node, child });
      walk(child);
    }
  };
  nodes.forEach(walk);
  return edges;
}

function relationshipCurvePath(source: LayoutNode, target: LayoutNode, index: number) {
  const x1 = source.x + CARD_W / 2;
  const y1 = source.y + CARD_H / 2;
  const x2 = target.x + CARD_W / 2;
  const y2 = target.y + CARD_H / 2;
  const horizontalDirection = x2 >= x1 ? 1 : -1;
  const verticalDirection = y2 >= y1 ? 1 : -1;
  const horizontalPull = Math.max(Math.abs(x2 - x1) * 0.25, 48);
  const verticalOffset = 48 + (index % 4) * 18;

  return [
    `M ${x1} ${y1}`,
    `C ${x1 + horizontalDirection * horizontalPull} ${y1 + verticalDirection * verticalOffset}`,
    `${x2 - horizontalDirection * horizontalPull} ${y2 - verticalDirection * verticalOffset}`,
    `${x2} ${y2}`,
  ].join(" ");
}

export function OrgChart() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const hasInitialized = useRef(false);

  const [viewMode, setViewMode] = useState<OrgViewMode>("hierarchy");
  const [relationshipCategoryFilter, setRelationshipCategoryFilter] = useState<
    EnterpriseRelationshipCategory | "all"
  >("all");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);

  const { data: orgTree, isLoading: orgLoading } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: enterpriseGraph, isLoading: enterpriseGraphLoading } = useQuery({
    queryKey: queryKeys.enterpriseGraph(selectedCompanyId!),
    queryFn: () => agentsApi.enterpriseGraph(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: selectedCompanyId
      ? [...queryKeys.agents.listGlobal, selectedCompanyId, "org-chart-agent-directory"]
      : ["agents", "none", "org-chart-agent-directory"],
    queryFn: async () => {
      try {
        return await agentsApi.listGlobal();
      } catch {
        return selectedCompanyId ? await agentsApi.list(selectedCompanyId) : [];
      }
    },
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Org Chart" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    hasInitialized.current = false;
  }, [selectedCompanyId, viewMode]);

  const mergedAgentMap = useMemo(() => {
    const map = new Map<string, AgentDirectoryEntry>();
    for (const agent of agents ?? []) {
      map.set(agent.id, agent);
    }
    for (const node of enterpriseGraph?.nodes ?? []) {
      map.set(node.id, node);
    }
    return map;
  }, [agents, enterpriseGraph]);

  const graphNodeMap = useMemo(() => {
    const map = new Map<string, EnterpriseGraphNode>();
    for (const node of enterpriseGraph?.nodes ?? []) {
      map.set(node.id, node);
    }
    return map;
  }, [enterpriseGraph]);

  const activeRoots = useMemo(
    () => (viewMode === "enterprise" ? enterpriseGraph?.roots ?? [] : orgTree ?? []),
    [enterpriseGraph, orgTree, viewMode],
  );

  const relationshipCategories = useMemo(() => {
    const categories = new Set<EnterpriseRelationshipCategory>();
    for (const link of enterpriseGraph?.links ?? []) {
      categories.add(link.category);
    }
    return Array.from(categories).sort((left, right) => left.localeCompare(right));
  }, [enterpriseGraph]);

  useEffect(() => {
    if (
      relationshipCategoryFilter !== "all" &&
      !relationshipCategories.includes(relationshipCategoryFilter)
    ) {
      setRelationshipCategoryFilter("all");
    }
  }, [relationshipCategories, relationshipCategoryFilter]);

  const filteredRelationshipLinks = useMemo(() => {
    if (viewMode !== "enterprise") return [];
    const links = enterpriseGraph?.links ?? [];
    if (relationshipCategoryFilter === "all") return links;
    return links.filter(
      (link: EnterpriseGraphLink) => link.category === relationshipCategoryFilter,
    );
  }, [enterpriseGraph, relationshipCategoryFilter, viewMode]);

  const layout = useMemo(() => layoutForest(activeRoots), [activeRoots]);
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const hierarchyEdges = useMemo(() => collectEdges(layout), [layout]);
  const layoutNodeMap = useMemo(
    () => new Map(allNodes.map((node) => [node.id, node])),
    [allNodes],
  );

  const bounds = useMemo(() => {
    if (allNodes.length === 0) return { width: 800, height: 600 };
    let maxX = 0;
    let maxY = 0;
    for (const node of allNodes) {
      maxX = Math.max(maxX, node.x + CARD_W);
      maxY = Math.max(maxY, node.y + CARD_H);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes]);

  const secondaryEdges = useMemo(() => {
    return filteredRelationshipLinks
      .map((link: EnterpriseGraphLink, index: number): SecondaryEdge | null => {
        const source = layoutNodeMap.get(link.sourceAgentId);
        const target = layoutNodeMap.get(link.targetAgentId);
        if (!source || !target) return null;
        return {
          ...link,
          path: relationshipCurvePath(source, target, index),
        };
      })
      .filter((edge: SecondaryEdge | null): edge is SecondaryEdge => edge !== null);
  }, [filteredRelationshipLinks, layoutNodeMap]);

  useEffect(() => {
    if (hasInitialized.current || allNodes.length === 0 || !containerRef.current) return;
    hasInitialized.current = true;

    const container = containerRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const scaleX = (containerW - 40) / bounds.width;
    const scaleY = (containerH - 40) / bounds.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);
    const chartW = bounds.width * fitZoom;
    const chartH = bounds.height * fitZoom;

    setZoom(fitZoom);
    setPan({
      x: (containerW - chartW) / 2,
      y: (containerH - chartH) / 2,
    });
  }, [allNodes, bounds]);

  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    const scaleX = (containerW - 40) / bounds.width;
    const scaleY = (containerH - 40) / bounds.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);
    const chartW = bounds.width * fitZoom;
    const chartH = bounds.height * fitZoom;
    setZoom(fitZoom);
    setPan({ x: (containerW - chartW) / 2, y: (containerH - chartH) / 2 });
  }, [bounds]);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-org-card]")) return;
      setDragging(true);
      dragStart.current = {
        x: event.clientX,
        y: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [pan],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!dragging) return;
      const dx = event.clientX - dragStart.current.x;
      const dy = event.clientY - dragStart.current.y;
      setPan({
        x: dragStart.current.panX + dx,
        y: dragStart.current.panY + dy,
      });
    },
    [dragging],
  );

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleWheel = useCallback(
    (event: React.WheelEvent) => {
      event.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      const nextZoom = Math.min(Math.max(zoom * factor, 0.2), 2);
      const scale = nextZoom / zoom;

      setPan({
        x: mouseX - scale * (mouseX - pan.x),
        y: mouseY - scale * (mouseY - pan.y),
      });
      setZoom(nextZoom);
    },
    [pan, zoom],
  );

  if (!selectedCompanyId) {
    return <EmptyState icon={Network} message="Select a company to view the org chart." />;
  }

  if (orgLoading || (viewMode === "enterprise" && enterpriseGraphLoading)) {
    return <PageSkeleton variant="org-chart" />;
  }

  if (activeRoots.length === 0) {
    return (
      <EmptyState
        icon={Network}
        message={
          viewMode === "enterprise"
            ? "No enterprise graph is available for this company yet."
            : "No organizational hierarchy defined."
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/company/import">
            <Button variant="outline" size="sm">
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Import company
            </Button>
          </Link>
          <Link to="/company/export">
            <Button variant="outline" size="sm">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export company
            </Button>
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={viewMode === "hierarchy" ? "default" : "outline"}
            onClick={() => setViewMode("hierarchy")}
          >
            <GitBranch className="mr-1.5 h-3.5 w-3.5" />
            Hierarchy
          </Button>
          <Button
            size="sm"
            variant={viewMode === "enterprise" ? "default" : "outline"}
            onClick={() => setViewMode("enterprise")}
          >
            <Workflow className="mr-1.5 h-3.5 w-3.5" />
            Enterprise Graph
          </Button>
        </div>
      </div>

      {viewMode === "enterprise" && enterpriseGraph ? (
        <>
          <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-2">
            <span className="text-xs font-medium text-foreground/80">Relationship filter</span>
            <Button
              size="sm"
              variant={relationshipCategoryFilter === "all" ? "default" : "outline"}
              onClick={() => setRelationshipCategoryFilter("all")}
            >
              All links
            </Button>
            {relationshipCategories.map((category) => (
              <Button
                key={category}
                size="sm"
                variant={relationshipCategoryFilter === category ? "default" : "outline"}
                onClick={() => setRelationshipCategoryFilter(category)}
              >
                {relationshipCategoryLabels[category]}
              </Button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">
              {filteredRelationshipLinks.length} secondary links in view
            </span>
          </div>

          <div className="mb-3 grid shrink-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {enterpriseGraph.workflowPacks.map((pack: EnterpriseWorkflowPackDefinition) => (
              <div
                key={pack.key}
                className="rounded-lg border border-border bg-card/70 p-3"
              >
                <div className="text-sm font-semibold text-foreground">{pack.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{pack.description}</div>
                <div className="mt-2 text-[11px] text-foreground/80">
                  <span className="font-medium">Applies to:</span> {pack.appliesTo}
                </div>
                <div className="mt-1 text-[11px] text-foreground/80">
                  <span className="font-medium">Stages:</span> {pack.stageLabels.join(" -> ")}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {pack.relationshipTypeKeys.slice(0, 4).join(", ")}
                  {pack.relationshipTypeKeys.length > 4 ? "..." : ""}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/20"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
          <button
            className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-sm transition-colors hover:bg-accent"
            onClick={() => {
              const nextZoom = Math.min(zoom * 1.2, 2);
              const container = containerRef.current;
              if (container) {
                const cx = container.clientWidth / 2;
                const cy = container.clientHeight / 2;
                const scale = nextZoom / zoom;
                setPan({
                  x: cx - scale * (cx - pan.x),
                  y: cy - scale * (cy - pan.y),
                });
              }
              setZoom(nextZoom);
            }}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-sm transition-colors hover:bg-accent"
            onClick={() => {
              const nextZoom = Math.max(zoom * 0.8, 0.2);
              const container = containerRef.current;
              if (container) {
                const cx = container.clientWidth / 2;
                const cy = container.clientHeight / 2;
                const scale = nextZoom / zoom;
                setPan({
                  x: cx - scale * (cx - pan.x),
                  y: cy - scale * (cy - pan.y),
                });
              }
              setZoom(nextZoom);
            }}
            aria-label="Zoom out"
          >
            &minus;
          </button>
          <button
            className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-[10px] transition-colors hover:bg-accent"
            onClick={fitToScreen}
            aria-label="Fit chart to screen"
            title="Fit chart to screen"
          >
            Fit
          </button>
        </div>

        {viewMode === "enterprise" ? (
          <div className="absolute left-3 top-3 z-10 max-w-xs rounded-lg border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
            <div className="text-sm font-semibold text-foreground">Enterprise overlay</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Solid lines are formal reporting. Dashed lines are secondary enterprise links.
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
              {relationshipCategories.map((category) => (
                <div key={category} className="flex items-center gap-2 text-[11px] text-foreground/80">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: relationshipCategoryStroke[category] }}
                  />
                  <span>{relationshipCategoryLabels[category]}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {hierarchyEdges.map(({ parent, child }) => {
              const x1 = parent.x + CARD_W / 2;
              const y1 = parent.y + CARD_H;
              const x2 = child.x + CARD_W / 2;
              const y2 = child.y;
              const midY = (y1 + y2) / 2;

              return (
                <path
                  key={`${parent.id}-${child.id}`}
                  d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={1.5}
                />
              );
            })}

            {secondaryEdges.map((edge: SecondaryEdge) => (
              <path
                key={edge.id}
                d={edge.path}
                fill="none"
                stroke={relationshipCategoryStroke[edge.category]}
                strokeDasharray="8 6"
                strokeWidth={2}
                opacity={0.9}
              />
            ))}
          </g>
        </svg>

        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {allNodes.map((node) => {
            const agent = mergedAgentMap.get(node.id);
            const graphNode = graphNodeMap.get(node.id);
            const dotColor = statusDotColor[node.status] ?? defaultDotColor;

            return (
              <div
                key={node.id}
                data-org-card
                className="absolute cursor-pointer select-none rounded-lg border border-border bg-card shadow-sm transition-[box-shadow,border-color] duration-150 hover:border-foreground/20 hover:shadow-md"
                style={{
                  left: node.x,
                  top: node.y,
                  minHeight: CARD_H,
                  width: CARD_W,
                }}
                onClick={() => navigate(agent ? agentUrl(agent) : `/agents/${node.id}`)}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="relative shrink-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                      <AgentIcon icon={agent?.icon} className="h-4.5 w-4.5 text-foreground/70" />
                    </div>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
                      style={{ backgroundColor: dotColor }}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-tight text-foreground">
                      {node.name}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                      {agent?.title ?? roleLabel(node.role)}
                    </div>
                    {node.externalToCompany ? (
                      <div className="mt-1 text-[10px] leading-tight text-muted-foreground/80">
                        {node.companyName ?? agent?.companyName ?? "External company"}
                      </div>
                    ) : null}
                    {agent ? (
                      <div className="mt-1 text-[10px] font-mono leading-tight text-muted-foreground/60">
                        {getAdapterLabel(agent.adapterType)}
                      </div>
                    ) : null}
                    {agent?.capabilities ? (
                      <div className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted-foreground/80">
                        {agent.capabilities}
                      </div>
                    ) : null}
                    {viewMode === "enterprise" && graphNode ? (
                      <div className="mt-1 text-[10px] leading-tight text-foreground/70">
                        {graphNode.secondaryLinkCount ?? 0} secondary links
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
