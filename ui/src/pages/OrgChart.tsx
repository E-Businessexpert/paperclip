import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  GitBranch,
  Network,
  Upload,
  Workflow,
} from "lucide-react";
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
import { agentUrl, cn } from "../lib/utils";

const CARD_W = 200;
const CARD_H = 108;
const GAP_X = 32;
const GAP_Y = 84;
const PADDING = 60;
const COMPANY_GROUP_PADDING_X = 28;
const COMPANY_GROUP_PADDING_Y = 24;
const COMPANY_GROUP_HEADER_H = 46;
const ORG_VIEW_MODE_STORAGE_KEY = "paperclip.orgChart.viewMode";
const CROSS_COMPANY_STROKE = "#ef4444";
const DEFAULT_EDGE_STROKE = "rgba(148, 163, 184, 0.55)";
const GROUP_ACCENTS = ["#38bdf8", "#60a5fa", "#34d399", "#f59e0b", "#a78bfa", "#f472b6"];

type OrgViewMode = "hierarchy" | "enterprise";

interface OrgChartProps {
  fullscreen?: boolean;
  initialViewMode?: OrgViewMode;
  lockViewMode?: OrgViewMode;
  showBackButton?: boolean;
  backHref?: string | null;
  title?: string;
  subtitle?: string;
}

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
  depth: number;
  childCount: number;
  collapsed: boolean;
  children: LayoutNode[];
}

interface HierarchyEdge {
  parent: LayoutNode;
  child: LayoutNode;
  crossCompany: boolean;
}

interface SecondaryEdge extends EnterpriseGraphLink {
  path: string;
  labelX: number;
  labelY: number;
  crossCompany: boolean;
}

interface CompanyGroup {
  key: string;
  companyId?: string;
  companyName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeCount: number;
  external: boolean;
  accentColor: string;
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

function readStoredOrgViewMode(fallback: OrgViewMode): OrgViewMode {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(ORG_VIEW_MODE_STORAGE_KEY);
    return stored === "enterprise" || stored === "hierarchy" ? stored : fallback;
  } catch {
    return fallback;
  }
}

function persistOrgViewMode(nextViewMode: OrgViewMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ORG_VIEW_MODE_STORAGE_KEY, nextViewMode);
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

function buildChildCountMap(roots: OrgNode[]): Map<string, number> {
  const counts = new Map<string, number>();

  const visit = (node: OrgNode) => {
    counts.set(node.id, node.reports.length);
    node.reports.forEach(visit);
  };

  roots.forEach(visit);
  return counts;
}

function applyCollapsedReports(node: OrgNode, collapsedNodeIds: ReadonlySet<string>): OrgNode {
  const reports = collapsedNodeIds.has(node.id)
    ? []
    : node.reports.map((child) => applyCollapsedReports(child, collapsedNodeIds));

  return {
    ...node,
    reports,
  };
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

function layoutTree(
  node: OrgNode,
  x: number,
  y: number,
  childCountMap: ReadonlyMap<string, number>,
  collapsedNodeIds: ReadonlySet<string>,
  depth = 0,
): LayoutNode {
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
      children.push(
        layoutTree(child, cursorX, y + CARD_H + GAP_Y, childCountMap, collapsedNodeIds, depth + 1),
      );
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
    depth,
    childCount: childCountMap.get(node.id) ?? 0,
    collapsed: collapsedNodeIds.has(node.id),
    children,
  };
}

function layoutForest(
  roots: OrgNode[],
  childCountMap: ReadonlyMap<string, number>,
  collapsedNodeIds: ReadonlySet<string>,
): LayoutNode[] {
  if (roots.length === 0) return [];

  let x = PADDING;
  const result: LayoutNode[] = [];
  for (const root of roots) {
    const width = subtreeWidth(root);
    result.push(layoutTree(root, x, PADDING, childCountMap, collapsedNodeIds));
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

function collectEdges(nodes: LayoutNode[]): HierarchyEdge[] {
  const edges: HierarchyEdge[] = [];
  const walk = (node: LayoutNode) => {
    for (const child of node.children) {
      edges.push({
        parent: node,
        child,
        crossCompany:
          Boolean(node.companyId) &&
          Boolean(child.companyId) &&
          node.companyId !== child.companyId,
      });
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
  const horizontalPull = Math.max(Math.abs(x2 - x1) * 0.25, 54);
  const verticalOffset = 46 + (index % 4) * 18;

  return [
    `M ${x1} ${y1}`,
    `C ${x1 + horizontalDirection * horizontalPull} ${y1 + verticalDirection * verticalOffset}`,
    `${x2 - horizontalDirection * horizontalPull} ${y2 - verticalDirection * verticalOffset}`,
    `${x2} ${y2}`,
  ].join(" ");
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickGroupAccent(key: string, external: boolean, selectedCompanyId?: string, companyId?: string) {
  if (external) return "#f59e0b";
  if (selectedCompanyId && companyId === selectedCompanyId) return "#38bdf8";
  return GROUP_ACCENTS[hashString(key) % GROUP_ACCENTS.length] ?? "#60a5fa";
}

function buildCompanyGroups(
  nodes: LayoutNode[],
  selectedCompanyId?: string | null,
): CompanyGroup[] {
  const groups = new Map<
    string,
    {
      companyId?: string;
      companyName: string;
      external: boolean;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      nodeCount: number;
    }
  >();

  for (const node of nodes) {
    const companyName = node.companyName ?? "Unknown company";
    const key = node.companyId ?? `external:${companyName}`;
    const external = Boolean(node.externalToCompany) || !node.companyId;
    const existing = groups.get(key);
    const minX = node.x;
    const minY = node.y;
    const maxX = node.x + CARD_W;
    const maxY = node.y + CARD_H;

    if (!existing) {
      groups.set(key, {
        companyId: node.companyId,
        companyName,
        external,
        minX,
        minY,
        maxX,
        maxY,
        nodeCount: 1,
      });
      continue;
    }

    existing.minX = Math.min(existing.minX, minX);
    existing.minY = Math.min(existing.minY, minY);
    existing.maxX = Math.max(existing.maxX, maxX);
    existing.maxY = Math.max(existing.maxY, maxY);
    existing.nodeCount += 1;
  }

  return Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      companyId: group.companyId,
      companyName: group.companyName,
      x: Math.max(group.minX - COMPANY_GROUP_PADDING_X, 12),
      y: Math.max(group.minY - COMPANY_GROUP_HEADER_H - COMPANY_GROUP_PADDING_Y, 12),
      width: group.maxX - group.minX + COMPANY_GROUP_PADDING_X * 2,
      height:
        group.maxY - group.minY + COMPANY_GROUP_PADDING_Y * 2 + COMPANY_GROUP_HEADER_H,
      nodeCount: group.nodeCount,
      external: group.external,
      accentColor: pickGroupAccent(key, group.external, selectedCompanyId ?? undefined, group.companyId),
    }))
    .sort((left, right) => (left.y === right.y ? left.x - right.x : left.y - right.y));
}

export function OrgChart({
  fullscreen = false,
  initialViewMode = "hierarchy",
  lockViewMode,
  showBackButton = false,
  backHref = null,
  title,
  subtitle,
}: OrgChartProps = {}) {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const hasInitialized = useRef(false);

  const [viewMode, setViewMode] = useState<OrgViewMode>(() =>
    lockViewMode ?? readStoredOrgViewMode(initialViewMode),
  );
  const [relationshipCategoryFilter, setRelationshipCategoryFilter] = useState<
    EnterpriseRelationshipCategory | "all"
  >("all");
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);

  const chartAccent = selectedCompany?.brandColor ?? "#60a5fa";
  const effectiveViewMode = lockViewMode ?? viewMode;
  const pageTitle = title ?? (fullscreen ? "Full Structure" : "Org Chart");
  const pageSubtitle =
    subtitle ??
    (fullscreen
      ? "Full-screen hierarchy view with individually collapsible subdivisions."
      : "Switch between formal hierarchy and the enterprise relationship overlay.");

  const { data: orgTree, isLoading: orgLoading } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: enterpriseGraph, isLoading: enterpriseGraphLoading } = useQuery({
    queryKey: queryKeys.enterpriseGraph(selectedCompanyId!),
    queryFn: () => agentsApi.enterpriseGraph(selectedCompanyId!),
    enabled: !!selectedCompanyId && effectiveViewMode === "enterprise",
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
    if (lockViewMode && viewMode !== lockViewMode) {
      setViewMode(lockViewMode);
    }
  }, [lockViewMode, viewMode]);

  useEffect(() => {
    if (!lockViewMode) {
      persistOrgViewMode(viewMode);
    }
  }, [lockViewMode, viewMode]);

  useEffect(() => {
    setBreadcrumbs([{ label: pageTitle }]);
  }, [pageTitle, setBreadcrumbs]);

  useEffect(() => {
    hasInitialized.current = false;
  }, [selectedCompanyId, effectiveViewMode]);

  useEffect(() => {
    setCollapsedNodeIds(new Set());
  }, [selectedCompanyId, effectiveViewMode]);

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

  const rawRoots = useMemo(
    () => (effectiveViewMode === "enterprise" ? enterpriseGraph?.roots ?? [] : orgTree ?? []),
    [effectiveViewMode, enterpriseGraph, orgTree],
  );

  const childCountMap = useMemo(() => buildChildCountMap(rawRoots), [rawRoots]);

  const activeRoots = useMemo(
    () => rawRoots.map((root) => applyCollapsedReports(root, collapsedNodeIds)),
    [collapsedNodeIds, rawRoots],
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
    if (effectiveViewMode !== "enterprise") return [];
    const links = enterpriseGraph?.links ?? [];
    if (relationshipCategoryFilter === "all") return links;
    return links.filter((link: EnterpriseGraphLink) => link.category === relationshipCategoryFilter);
  }, [effectiveViewMode, enterpriseGraph, relationshipCategoryFilter]);

  const layout = useMemo(
    () => layoutForest(activeRoots, childCountMap, collapsedNodeIds),
    [activeRoots, childCountMap, collapsedNodeIds],
  );
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const hierarchyEdges = useMemo(() => collectEdges(layout), [layout]);
  const layoutNodeMap = useMemo(() => new Map(allNodes.map((node) => [node.id, node])), [allNodes]);
  const companyGroups = useMemo(
    () =>
      effectiveViewMode === "enterprise"
        ? buildCompanyGroups(allNodes, selectedCompanyId)
        : [],
    [allNodes, effectiveViewMode, selectedCompanyId],
  );

  const bounds = useMemo(() => {
    if (allNodes.length === 0 && companyGroups.length === 0) {
      return { width: 800, height: 600 };
    }

    let maxX = 0;
    let maxY = 0;
    for (const node of allNodes) {
      maxX = Math.max(maxX, node.x + CARD_W);
      maxY = Math.max(maxY, node.y + CARD_H);
    }
    for (const group of companyGroups) {
      maxX = Math.max(maxX, group.x + group.width);
      maxY = Math.max(maxY, group.y + group.height);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes, companyGroups]);

  const secondaryEdges = useMemo(() => {
    return filteredRelationshipLinks
      .map((link: EnterpriseGraphLink, index: number): SecondaryEdge | null => {
        const source = layoutNodeMap.get(link.sourceAgentId);
        const target = layoutNodeMap.get(link.targetAgentId);
        if (!source || !target) return null;

        const x1 = source.x + CARD_W / 2;
        const y1 = source.y + CARD_H / 2;
        const x2 = target.x + CARD_W / 2;
        const y2 = target.y + CARD_H / 2;

        return {
          ...link,
          path: relationshipCurvePath(source, target, index),
          labelX: (x1 + x2) / 2,
          labelY: (y1 + y2) / 2 - 14 - (index % 3) * 8,
          crossCompany:
            Boolean(link.sourceCompanyId) &&
            Boolean(link.targetCompanyId) &&
            link.sourceCompanyId !== link.targetCompanyId,
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

  const handleViewModeChange = useCallback(
    (nextViewMode: OrgViewMode) => {
      if (lockViewMode) return;
      setViewMode(nextViewMode);
    },
    [lockViewMode],
  );

  const toggleNodeCollapse = useCallback((nodeId: string) => {
    setCollapsedNodeIds((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const zoomAroundCenter = useCallback(
    (nextZoom: number) => {
      const container = containerRef.current;
      if (!container) return;
      const cx = container.clientWidth / 2;
      const cy = container.clientHeight / 2;
      const scale = nextZoom / zoom;
      setPan({
        x: cx - scale * (cx - pan.x),
        y: cy - scale * (cy - pan.y),
      });
      setZoom(nextZoom);
    },
    [pan, zoom],
  );

  if (!selectedCompanyId) {
    return <EmptyState icon={Network} message="Select a company to view the org chart." />;
  }

  if (orgLoading || (effectiveViewMode === "enterprise" && enterpriseGraphLoading)) {
    return <PageSkeleton variant="org-chart" />;
  }

  if (activeRoots.length === 0) {
    return (
      <EmptyState
        icon={Network}
        message={
          effectiveViewMode === "enterprise"
            ? "No enterprise graph is available for this company yet."
            : "No organizational hierarchy defined."
        }
      />
    );
  }

  return (
    <div className={cn("flex h-full flex-col gap-3", fullscreen && "h-full")}>
      {showBackButton ? (
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-border/70 bg-gradient-to-r from-card/95 via-card/90 to-muted/55 px-4 py-3 shadow-sm dark:border-white/10 dark:from-slate-950/92 dark:via-slate-950/86 dark:to-slate-900/72">
          <div className="flex min-w-0 items-center gap-3">
            {backHref ? (
              <Link to={backHref}>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Back
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back
              </Button>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{pageTitle}</div>
              <div className="truncate text-xs text-muted-foreground">{pageSubtitle}</div>
            </div>
          </div>
        </div>
      ) : null}

      {!fullscreen ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-gradient-to-br from-card/95 via-card/90 to-muted/50 px-3 py-3 shadow-sm dark:border-white/10 dark:from-slate-950/90 dark:via-slate-950/85 dark:to-slate-900/80">
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
              variant={effectiveViewMode === "hierarchy" ? "default" : "outline"}
              onClick={() => handleViewModeChange("hierarchy")}
            >
              <GitBranch className="mr-1.5 h-3.5 w-3.5" />
              Hierarchy
            </Button>
            <Button
              size="sm"
              variant={effectiveViewMode === "enterprise" ? "default" : "outline"}
              onClick={() => handleViewModeChange("enterprise")}
            >
              <Workflow className="mr-1.5 h-3.5 w-3.5" />
              Enterprise
            </Button>
          </div>
        </div>
      ) : null}

      {effectiveViewMode === "enterprise" && enterpriseGraph && !fullscreen ? (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-gradient-to-r from-card/90 via-card/80 to-muted/40 px-3 py-2 shadow-sm dark:border-white/10 dark:from-slate-950/85 dark:via-slate-950/75 dark:to-slate-900/65">
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

          <div className="grid shrink-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {enterpriseGraph.workflowPacks.map((pack: EnterpriseWorkflowPackDefinition) => (
              <div
                key={pack.key}
                className="rounded-xl border border-border/70 bg-gradient-to-br from-card/90 via-card/80 to-muted/35 p-3 shadow-sm dark:border-white/10 dark:from-slate-950/80 dark:via-slate-950/70 dark:to-slate-900/55"
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
        className={cn(
          "relative min-h-0 flex-1 overflow-hidden border border-border/70 bg-gradient-to-br from-slate-100/70 via-background to-slate-200/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:border-white/10 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/90",
          fullscreen ? "rounded-3xl" : "rounded-2xl",
        )}
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage: `radial-gradient(circle at top left, ${chartAccent}22, transparent 28%), radial-gradient(circle at bottom right, ${chartAccent}18, transparent 32%)`,
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18] dark:opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.22) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/70 bg-background/90 text-sm shadow-sm backdrop-blur transition-colors hover:bg-accent dark:border-white/10 dark:bg-slate-950/80"
            onClick={() => zoomAroundCenter(Math.min(zoom * 1.2, 2))}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/70 bg-background/90 text-sm shadow-sm backdrop-blur transition-colors hover:bg-accent dark:border-white/10 dark:bg-slate-950/80"
            onClick={() => zoomAroundCenter(Math.max(zoom * 0.8, 0.2))}
            aria-label="Zoom out"
          >
            &minus;
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/70 bg-background/90 text-[10px] shadow-sm backdrop-blur transition-colors hover:bg-accent dark:border-white/10 dark:bg-slate-950/80"
            onClick={fitToScreen}
            aria-label="Fit chart to screen"
            title="Fit chart to screen"
          >
            Fit
          </button>
        </div>

        {effectiveViewMode === "enterprise" ? (
          <div className="absolute left-3 top-3 z-10 max-w-xs rounded-2xl border border-border/70 bg-background/92 p-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-950/82">
            <div className="text-sm font-semibold text-foreground">Enterprise overlay</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Tree edges remain the formal hierarchy. Red lines cross company boundaries.
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
            {companyGroups.map((group) => (
              <g key={group.key}>
                <rect
                  x={group.x}
                  y={group.y}
                  width={group.width}
                  height={group.height}
                  rx={26}
                  fill={`${group.accentColor}16`}
                  stroke={`${group.accentColor}88`}
                  strokeWidth={1.5}
                />
                <line
                  x1={group.x + 18}
                  y1={group.y + COMPANY_GROUP_HEADER_H}
                  x2={group.x + group.width - 18}
                  y2={group.y + COMPANY_GROUP_HEADER_H}
                  stroke={`${group.accentColor}66`}
                  strokeWidth={1}
                />
                <text x={group.x + 20} y={group.y + 27} fill="#f8fafc" className="text-[13px] font-semibold">
                  {group.companyName}
                </text>
                <text x={group.x + 20} y={group.y + 41} fill="#cbd5e1" className="text-[10px]">
                  {group.nodeCount} agent{group.nodeCount === 1 ? "" : "s"}
                </text>
              </g>
            ))}

            {hierarchyEdges.map(({ parent, child, crossCompany }) => {
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
                  stroke={crossCompany ? CROSS_COMPANY_STROKE : DEFAULT_EDGE_STROKE}
                  strokeWidth={crossCompany ? 2.25 : 1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}

            {secondaryEdges.map((edge) => {
              const stroke = edge.crossCompany
                ? CROSS_COMPANY_STROKE
                : relationshipCategoryStroke[edge.category];
              const labelWidth = Math.max(edge.typeLabel.length * 6.25 + 22, 92);
              return (
                <g key={edge.id}>
                  <path
                    d={edge.path}
                    fill="none"
                    stroke={stroke}
                    strokeDasharray={edge.crossCompany ? "10 6" : "7 6"}
                    strokeWidth={2}
                    opacity={0.84}
                  />
                  <rect
                    x={edge.labelX - labelWidth / 2}
                    y={edge.labelY - 10}
                    width={labelWidth}
                    height={20}
                    rx={10}
                    fill="rgba(15,23,42,0.82)"
                    stroke={stroke}
                    strokeWidth={0.75}
                  />
                  <text x={edge.labelX} y={edge.labelY + 3} textAnchor="middle" fill="#f8fafc" className="text-[10px] font-medium">
                    {edge.typeLabel}
                  </text>
                </g>
              );
            })}
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
            const cardAccent = node.externalToCompany ? "#f59e0b" : chartAccent;
            const showCompanyBadge =
              Boolean(node.companyName) &&
              (effectiveViewMode === "enterprise" || Boolean(node.externalToCompany));

            return (
              <div
                key={node.id}
                data-org-card
                className="absolute cursor-pointer select-none overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card/95 via-card to-muted/40 shadow-[0_18px_35px_-24px_rgba(15,23,42,0.55)] transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_24px_50px_-28px_rgba(15,23,42,0.7)] dark:border-white/10 dark:from-slate-950/92 dark:via-slate-950/88 dark:to-slate-900/72"
                style={{
                  left: node.x,
                  top: node.y,
                  minHeight: CARD_H,
                  width: CARD_W,
                }}
                onClick={() => navigate(agent ? agentUrl(agent) : `/agents/${node.id}`)}
              >
                <div
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: `linear-gradient(90deg, ${cardAccent}, transparent)` }}
                />

                {node.childCount > 0 ? (
                  <button
                    type="button"
                    data-org-collapse
                    className="absolute right-2 top-2 z-10 flex h-7 items-center gap-1 rounded-full border border-border/60 bg-background/86 px-2 text-[10px] font-medium text-foreground/75 shadow-sm backdrop-blur transition-colors hover:bg-accent dark:border-white/10 dark:bg-slate-950/78"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleNodeCollapse(node.id);
                    }}
                    aria-label={node.collapsed ? "Expand subdivision" : "Collapse subdivision"}
                    title={node.collapsed ? "Expand subdivision" : "Collapse subdivision"}
                  >
                    {node.collapsed ? (
                      <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    <span>{node.childCount}</span>
                  </button>
                ) : null}

                <div className="flex items-start gap-3 px-4 py-3">
                  <div className="relative mt-0.5 shrink-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-background/80 ring-1 ring-border/60 dark:ring-white/10">
                      <AgentIcon icon={agent?.icon} className="h-4.5 w-4.5 text-foreground/70" />
                    </div>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
                      style={{ backgroundColor: dotColor }}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="pr-9 text-sm font-semibold leading-tight text-foreground">
                      {node.name}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                      {agent?.title ?? roleLabel(node.role)}
                    </div>

                    {showCompanyBadge ? (
                      <div className="mt-1 inline-flex max-w-full rounded-full border border-foreground/10 bg-foreground/[0.05] px-2 py-0.5 text-[10px] leading-tight text-foreground/80">
                        {node.companyName}
                      </div>
                    ) : null}

                    {agent ? (
                      <div className="mt-1 text-[10px] font-mono leading-tight text-muted-foreground/60">
                        {getAdapterLabel(agent.adapterType)}
                      </div>
                    ) : null}

                    {node.childCount > 0 ? (
                      <div className="mt-1 text-[10px] leading-tight text-foreground/70">
                        {node.collapsed
                          ? `${node.childCount} subdivision${node.childCount === 1 ? "" : "s"} hidden`
                          : `${node.childCount} direct subdivision${node.childCount === 1 ? "" : "s"}`}
                      </div>
                    ) : null}

                    {agent?.capabilities ? (
                      <div className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted-foreground/80">
                        {agent.capabilities}
                      </div>
                    ) : null}

                    {effectiveViewMode === "enterprise" && graphNode ? (
                      <div className="mt-1 text-[10px] leading-tight text-foreground/70">
                        {graphNode.secondaryLinkCount ?? 0} secondary link
                        {(graphNode.secondaryLinkCount ?? 0) === 1 ? "" : "s"}
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
