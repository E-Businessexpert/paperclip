import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  GitBranch,
  Network,
  SlidersHorizontal,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { agentsApi, type AgentDirectoryEntry, type OrgNode } from "../api/agents";
import { getAdapterLabel } from "../adapters/adapter-display-registry";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import {
  groupAgentsByDepartment,
  inferAgentDepartment,
  type AgentDepartmentDefinition,
  type AgentDepartmentKey,
} from "../lib/agent-departments";
import {
  buildOrgChartExportBaseName,
  downloadOrgChartExport,
  type OrgChartExportFormat,
  type OrgChartExportPayload,
} from "../lib/org-chart-export";
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
const ALL_COMPANIES_FILTER = "__all_companies__";

type OrgViewMode = "hierarchy" | "enterprise";
type EnterpriseGraphScopeMode = "company" | "family";
type RelationshipDirectionFilter = "both" | "downstream" | "upstream";

interface OrgChartProps {
  fullscreen?: boolean;
  initialViewMode?: OrgViewMode;
  lockViewMode?: OrgViewMode;
  showBackButton?: boolean;
  backHref?: string | null;
  title?: string;
  subtitle?: string;
  enterpriseScope?: EnterpriseGraphScopeMode;
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

type InspectorPermissionKey =
  | "canCreateAgents"
  | "canAssignTasks"
  | "canDesignOrganizations"
  | "canManageRelationshipTypes"
  | "canManageServiceDiscovery"
  | "canManageDeploymentAssignments"
  | "canGenerateSystemTopology";

type InspectorItemKey = `permission:${InspectorPermissionKey}` | `action:${string}`;

type GraphFocusTarget =
  | { kind: "agent"; id: string }
  | { kind: "department"; id: AgentDepartmentKey }
  | null;

interface PermissionDescriptor {
  key: InspectorPermissionKey;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  categories?: readonly EnterpriseRelationshipCategory[];
  includeHierarchy?: boolean;
  includeDiscovery?: boolean;
}

interface InspectorPermissionItem extends PermissionDescriptor {
  itemKey: `permission:${InspectorPermissionKey}`;
  enabledCount: number;
  totalCount: number;
}

interface InspectorActionItem {
  itemKey: `action:${string}`;
  label: string;
  description: string;
  color: string;
  count: number;
  kind: "hierarchy" | "relationship";
  typeKey?: string;
}

interface FocusOverlayEdge {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  path: string;
  color: string;
  label: string;
  labelX: number;
  labelY: number;
  dashed: boolean;
  crossCompany: boolean;
  showLabel: boolean;
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

interface WiringVisibilityState {
  showCompanyContainers: boolean;
  showCompanyNames: boolean;
  showAgents: boolean;
  showAgentNames: boolean;
  showPermissions: boolean;
  showReportsToLines: boolean;
  showRelationshipLines: boolean;
}

interface CompanyOption {
  id: string;
  name: string;
}

interface CompanyAggregateEdge {
  id: string;
  sourceKey: string;
  targetKey: string;
  path: string;
  labelX: number;
  labelY: number;
  label: string;
  color: string;
  dashed: boolean;
  count: number;
}

interface ExportMenuButtonProps {
  open: boolean;
  busyFormat: OrgChartExportFormat | null;
  error: string | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onExport: (format: OrgChartExportFormat) => void;
}

const structureExportOptions: Array<{
  format: OrgChartExportFormat;
  label: string;
  description: string;
}> = [
  {
    format: "png",
    label: "PNG",
    description: "Image snapshot with the current structure layout.",
  },
  {
    format: "jpeg",
    label: "JPEG",
    description: "Compressed image snapshot for quick sharing.",
  },
  {
    format: "pdf",
    label: "PDF",
    description: "Single-page document snapshot of the current view.",
  },
  {
    format: "docx",
    label: "DOCX",
    description: "Word document outline of the visible structure.",
  },
  {
    format: "mermaid",
    label: "Mermaid",
    description: "Flowchart source for documentation and handoff.",
  },
  {
    format: "json",
    label: "JSON",
    description: "Structured export of nodes, edges, groups, and metadata.",
  },
];

function ExportMenuButton({
  open,
  busyFormat,
  error,
  menuRef,
  onToggle,
  onExport,
}: ExportMenuButtonProps) {
  return (
    <div ref={menuRef} className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Export structure
      </Button>

      {open ? (
        <div className="absolute right-0 top-11 z-30 w-[320px] rounded-2xl border border-border/70 bg-background/96 p-2 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-slate-950/94">
          <div className="border-b border-border/60 px-2 pb-2 dark:border-white/10">
            <div className="text-sm font-semibold text-foreground">Export current structure</div>
            <div className="mt-1 text-xs text-muted-foreground">
              The download follows the current visible hierarchy or enterprise view.
            </div>
          </div>

          <div className="mt-2 grid gap-1">
            {structureExportOptions.map((option) => {
              const busy = busyFormat === option.format;
              return (
                <button
                  key={option.format}
                  type="button"
                  className="rounded-xl border border-transparent px-3 py-2 text-left transition-colors hover:border-foreground/10 hover:bg-accent/70 disabled:cursor-wait disabled:opacity-70"
                  disabled={busyFormat !== null}
                  onClick={() => onExport(option.format)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">{option.label}</span>
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {busy ? "Exporting" : "Ready"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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
const hierarchyFocusStroke = "#38bdf8";

const inspectorPermissionDescriptors: readonly PermissionDescriptor[] = [
  {
    key: "canCreateAgents",
    label: "Create Agents",
    shortLabel: "Create",
    description: "Provision and fan out new operating nodes across formal and delivery lanes.",
    color: "#38bdf8",
    categories: ["delivery", "matrix", "communication"],
    includeHierarchy: true,
  },
  {
    key: "canAssignTasks",
    label: "Assign Tasks",
    shortLabel: "Assign",
    description: "Push work through delivery, communication, and matrix relationships.",
    color: "#34d399",
    categories: ["delivery", "communication", "matrix"],
    includeHierarchy: true,
  },
  {
    key: "canDesignOrganizations",
    label: "Design Organizations",
    shortLabel: "Design",
    description: "Shape reporting lines, governance structure, and decision loops.",
    color: "#a78bfa",
    categories: ["matrix", "governance", "decision"],
    includeHierarchy: true,
  },
  {
    key: "canManageRelationshipTypes",
    label: "Manage Relationship Types",
    shortLabel: "Types",
    description: "Control the relationship schema that wires agents and departments together.",
    color: "#f59e0b",
  },
  {
    key: "canManageServiceDiscovery",
    label: "Manage Service Discovery",
    shortLabel: "Discovery",
    description: "Track runtime, service, asset, and data dependencies discovered in the estate.",
    color: "#06b6d4",
    categories: ["service", "asset", "data"],
    includeDiscovery: true,
  },
  {
    key: "canManageDeploymentAssignments",
    label: "Manage Deployments",
    shortLabel: "Deploy",
    description: "Own rollout, hosting, asset assignment, and deployment routing.",
    color: "#f97316",
    categories: ["service", "asset", "delivery"],
    includeDiscovery: true,
  },
  {
    key: "canGenerateSystemTopology",
    label: "Generate Topology",
    shortLabel: "Topology",
    description: "Trace the live topology between agents, services, runtime, and data paths.",
    color: "#22c55e",
    categories: ["service", "data", "communication", "governance", "custom"],
    includeDiscovery: true,
  },
] as const;

const inspectorPermissionDescriptorMap = new Map(
  inspectorPermissionDescriptors.map((descriptor) => [descriptor.key, descriptor]),
);

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

function createDefaultWiringVisibility(viewMode: OrgViewMode): WiringVisibilityState {
  if (viewMode !== "enterprise") {
    return {
      showCompanyContainers: false,
      showCompanyNames: true,
      showAgents: true,
      showAgentNames: true,
      showPermissions: true,
      showReportsToLines: true,
      showRelationshipLines: false,
    };
  }

  return {
    showCompanyContainers: true,
    showCompanyNames: true,
    showAgents: true,
    showAgentNames: true,
    showPermissions: false,
    showReportsToLines: true,
    showRelationshipLines: true,
  };
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

function countDirectAndIndirectReports(node: OrgNode): number {
  return node.reports.reduce(
    (total, child) => total + 1 + countDirectAndIndirectReports(child),
    0,
  );
}

function sortRootsForPresentation(roots: OrgNode[]): OrgNode[] {
  return [...roots].sort((left, right) => {
    const reportDelta = countDirectAndIndirectReports(right) - countDirectAndIndirectReports(left);
    if (reportDelta !== 0) return reportDelta;
    return left.name.localeCompare(right.name);
  });
}

function buildPreviewCollapsedNodeIds(
  roots: OrgNode[],
  collapseFromDepth: number,
): Set<string> {
  const collapsed = new Set<string>();

  const visit = (node: OrgNode, depth: number) => {
    if (depth >= collapseFromDepth && node.reports.length > 0) {
      collapsed.add(node.id);
    }

    node.reports.forEach((child) => visit(child, depth + 1));
  };

  roots.forEach((root) => visit(root, 0));
  return collapsed;
}

function buildRootPreviewCollapsedNodeIds(roots: OrgNode[]): Set<string> {
  return buildPreviewCollapsedNodeIds(roots, 1);
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

function companyGroupKey(companyId?: string | null, companyName?: string | null) {
  return companyId ?? `external:${companyName ?? "Unknown company"}`;
}

function companyCurvePath(source: CompanyGroup, target: CompanyGroup, index: number) {
  const x1 = source.x + source.width / 2;
  const y1 = source.y + source.height / 2;
  const x2 = target.x + target.width / 2;
  const y2 = target.y + target.height / 2;
  const horizontalDirection = x2 >= x1 ? 1 : -1;
  const verticalDirection = y2 >= y1 ? 1 : -1;
  const horizontalPull = Math.max(Math.abs(x2 - x1) * 0.3, 72);
  const verticalOffset = 56 + (index % 4) * 18;

  return [
    `M ${x1} ${y1}`,
    `C ${x1 + horizontalDirection * horizontalPull} ${y1 + verticalDirection * verticalOffset}`,
    `${x2 - horizontalDirection * horizontalPull} ${y2 - verticalDirection * verticalOffset}`,
    `${x2} ${y2}`,
  ].join(" ");
}

function hierarchyPath(parent: LayoutNode, child: LayoutNode) {
  const x1 = parent.x + CARD_W / 2;
  const y1 = parent.y + CARD_H;
  const x2 = child.x + CARD_W / 2;
  const y2 = child.y;
  const midY = (y1 + y2) / 2;

  return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
}

function sanitizeMarkerId(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function permissionFlag(
  permissions: Record<string, boolean | undefined> | undefined,
  key: InspectorPermissionKey,
) {
  return Boolean(permissions?.[key]);
}

function permissionMatchesLink(descriptor: PermissionDescriptor, link: EnterpriseGraphLink) {
  if (!descriptor.categories || descriptor.categories.length === 0) {
    return true;
  }

  return descriptor.categories.includes(link.category);
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
    const key = companyGroupKey(node.companyId, companyName);
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
  enterpriseScope = "company",
}: OrgChartProps = {}) {
  const { companies, selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const hasInitialized = useRef(false);
  const initialStoredViewMode = lockViewMode ?? readStoredOrgViewMode(initialViewMode);

  const [viewMode, setViewMode] = useState<OrgViewMode>(() => initialStoredViewMode);
  const [relationshipCategoryFilter, setRelationshipCategoryFilter] = useState<
    EnterpriseRelationshipCategory | "all"
  >("all");
  const [relationshipDirectionFilter, setRelationshipDirectionFilter] =
    useState<RelationshipDirectionFilter>("both");
  const [companyAFilter, setCompanyAFilter] = useState<string>(ALL_COMPANIES_FILTER);
  const [companyBFilter, setCompanyBFilter] = useState<string>(ALL_COMPANIES_FILTER);
  const [wiringVisibility, setWiringVisibility] = useState<WiringVisibilityState>(() =>
    createDefaultWiringVisibility(initialStoredViewMode),
  );
  const [filtersOpen, setFiltersOpen] = useState(() => initialStoredViewMode === "enterprise");
  const [inspectorMinimized, setInspectorMinimized] = useState(false);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<OrgChartExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<GraphFocusTarget>(null);
  const [selectedInspectorItem, setSelectedInspectorItem] = useState<InspectorItemKey | null>(null);

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
    queryKey: queryKeys.enterpriseGraph(selectedCompanyId!, enterpriseScope),
    queryFn: () => agentsApi.enterpriseGraph(selectedCompanyId!, enterpriseScope),
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
    setFocusTarget(null);
    setSelectedInspectorItem(null);
  }, [selectedCompanyId, effectiveViewMode]);

  useEffect(() => {
    setRelationshipCategoryFilter("all");
    setRelationshipDirectionFilter("both");
    setCompanyAFilter(ALL_COMPANIES_FILTER);
    setCompanyBFilter(ALL_COMPANIES_FILTER);
    setWiringVisibility(createDefaultWiringVisibility(effectiveViewMode));
    setFiltersOpen(effectiveViewMode === "enterprise");
    setInspectorMinimized(false);
  }, [effectiveViewMode, selectedCompanyId]);

  useEffect(() => {
    if (!wiringVisibility.showPermissions && selectedInspectorItem?.startsWith("permission:")) {
      setSelectedInspectorItem(null);
    }
  }, [selectedInspectorItem, wiringVisibility.showPermissions]);

  useEffect(() => {
    if (!exportMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!exportMenuRef.current?.contains(target)) {
        setExportMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [exportMenuOpen]);

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

  const inspectorAgents = useMemo(
    () =>
      Array.from(mergedAgentMap.values()).sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    [mergedAgentMap],
  );

  const departmentGroups = useMemo(
    () => groupAgentsByDepartment(inspectorAgents),
    [inspectorAgents],
  );

  const departmentByAgentId = useMemo(() => {
    const map = new Map<string, AgentDepartmentDefinition>();
    for (const agent of inspectorAgents) {
      map.set(agent.id, inferAgentDepartment(agent));
    }
    return map;
  }, [inspectorAgents]);

  const graphNodeMap = useMemo(() => {
    const map = new Map<string, EnterpriseGraphNode>();
    for (const node of enterpriseGraph?.nodes ?? []) {
      map.set(node.id, node);
    }
    return map;
  }, [enterpriseGraph]);

  const companyOptions = useMemo<CompanyOption[]>(() => {
    const presentCompanies = new Map<string, string>();
    for (const node of enterpriseGraph?.nodes ?? []) {
      if (!node.companyId) continue;
      presentCompanies.set(node.companyId, node.companyName ?? node.name);
    }

    const options = companies
      .filter((company) => presentCompanies.has(company.id))
      .map((company) => ({
        id: company.id,
        name: company.name,
      }));

    for (const [companyId, companyName] of presentCompanies.entries()) {
      if (options.some((option) => option.id === companyId)) continue;
      options.push({ id: companyId, name: companyName });
    }

    return options.sort((left, right) => left.name.localeCompare(right.name));
  }, [companies, enterpriseGraph]);

  useEffect(() => {
    if (
      companyAFilter !== ALL_COMPANIES_FILTER &&
      !companyOptions.some((option) => option.id === companyAFilter)
    ) {
      setCompanyAFilter(ALL_COMPANIES_FILTER);
    }

    if (
      companyBFilter !== ALL_COMPANIES_FILTER &&
      !companyOptions.some((option) => option.id === companyBFilter)
    ) {
      setCompanyBFilter(ALL_COMPANIES_FILTER);
    }
  }, [companyAFilter, companyBFilter, companyOptions]);

  const rawRoots = useMemo(
    () =>
      sortRootsForPresentation(
        effectiveViewMode === "enterprise" ? enterpriseGraph?.roots ?? [] : orgTree ?? [],
      ),
    [effectiveViewMode, enterpriseGraph, orgTree],
  );

  const childCountMap = useMemo(() => buildChildCountMap(rawRoots), [rawRoots]);

  useEffect(() => {
    if (fullscreen && effectiveViewMode === "hierarchy") {
      setCollapsedNodeIds(buildRootPreviewCollapsedNodeIds(rawRoots));
      return;
    }

    setCollapsedNodeIds(new Set());
  }, [effectiveViewMode, fullscreen, rawRoots, selectedCompanyId]);

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

  const categoryFilteredRelationshipLinks = useMemo(() => {
    if (effectiveViewMode !== "enterprise") return [];
    const links = enterpriseGraph?.links ?? [];
    if (relationshipCategoryFilter === "all") return links;
    return links.filter((link: EnterpriseGraphLink) => link.category === relationshipCategoryFilter);
  }, [effectiveViewMode, enterpriseGraph, relationshipCategoryFilter]);

  const matchesCompanyFilter = useCallback(
    (sourceCompanyId?: string | null, targetCompanyId?: string | null) => {
      const hasCompanyA = companyAFilter !== ALL_COMPANIES_FILTER;
      const hasCompanyB = companyBFilter !== ALL_COMPANIES_FILTER;
      if (!hasCompanyA && !hasCompanyB) return true;

      const source = sourceCompanyId ?? null;
      const target = targetCompanyId ?? null;

      if (hasCompanyA && hasCompanyB) {
        if (companyAFilter === companyBFilter) {
          return source === companyAFilter || target === companyAFilter;
        }

        if (relationshipDirectionFilter === "downstream") {
          return source === companyAFilter && target === companyBFilter;
        }

        if (relationshipDirectionFilter === "upstream") {
          return source === companyBFilter && target === companyAFilter;
        }

        return (
          (source === companyAFilter && target === companyBFilter) ||
          (source === companyBFilter && target === companyAFilter)
        );
      }

      const selectedFilter = hasCompanyA ? companyAFilter : companyBFilter;
      if (relationshipDirectionFilter === "downstream") return source === selectedFilter;
      if (relationshipDirectionFilter === "upstream") return target === selectedFilter;
      return source === selectedFilter || target === selectedFilter;
    },
    [companyAFilter, companyBFilter, relationshipDirectionFilter],
  );

  const filteredRelationshipLinks = useMemo(
    () =>
      categoryFilteredRelationshipLinks.filter((link) =>
        matchesCompanyFilter(link.sourceCompanyId, link.targetCompanyId),
      ),
    [categoryFilteredRelationshipLinks, matchesCompanyFilter],
  );

  const layout = useMemo(
    () => layoutForest(activeRoots, childCountMap, collapsedNodeIds),
    [activeRoots, childCountMap, collapsedNodeIds],
  );
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const hierarchyEdges = useMemo(() => collectEdges(layout), [layout]);
  const filteredHierarchyEdges = useMemo(
    () =>
      effectiveViewMode !== "enterprise"
        ? hierarchyEdges
        : hierarchyEdges.filter(({ parent, child }) =>
            matchesCompanyFilter(parent.companyId, child.companyId),
          ),
    [effectiveViewMode, hierarchyEdges, matchesCompanyFilter],
  );
  const layoutNodeMap = useMemo(() => new Map(allNodes.map((node) => [node.id, node])), [allNodes]);
  const companyGroups = useMemo(
    () =>
      effectiveViewMode === "enterprise"
        ? buildCompanyGroups(allNodes, selectedCompanyId)
        : [],
    [allNodes, effectiveViewMode, selectedCompanyId],
  );
  const companyGroupsMap = useMemo(
    () => new Map(companyGroups.map((group) => [group.key, group])),
    [companyGroups],
  );
  const companyScopedFilterActive =
    companyAFilter !== ALL_COMPANIES_FILTER || companyBFilter !== ALL_COMPANIES_FILTER;

  const highlightedNodeIds = useMemo(() => {
    if (!companyScopedFilterActive) return new Set<string>();

    const nodeIds = new Set<string>();
    filteredRelationshipLinks.forEach((link) => {
      nodeIds.add(link.sourceAgentId);
      nodeIds.add(link.targetAgentId);
    });
    filteredHierarchyEdges.forEach(({ parent, child }) => {
      nodeIds.add(parent.id);
      nodeIds.add(child.id);
    });
    allNodes.forEach((node) => {
      if (
        (companyAFilter !== ALL_COMPANIES_FILTER && node.companyId === companyAFilter) ||
        (companyBFilter !== ALL_COMPANIES_FILTER && node.companyId === companyBFilter)
      ) {
        nodeIds.add(node.id);
      }
    });

    return nodeIds;
  }, [
    allNodes,
    companyAFilter,
    companyBFilter,
    companyScopedFilterActive,
    filteredHierarchyEdges,
    filteredRelationshipLinks,
  ]);

  const highlightedCompanyKeys = useMemo(() => {
    if (!companyScopedFilterActive) return new Set<string>();

    const keys = new Set<string>();
    const addCompanyKey = (companyId?: string | null, companyName?: string | null) => {
      if (!companyId && !companyName) return;
      keys.add(companyGroupKey(companyId, companyName));
    };

    filteredRelationshipLinks.forEach((link) => {
      addCompanyKey(link.sourceCompanyId, link.sourceCompanyName);
      addCompanyKey(link.targetCompanyId, link.targetCompanyName);
    });
    filteredHierarchyEdges.forEach(({ parent, child }) => {
      addCompanyKey(parent.companyId, parent.companyName);
      addCompanyKey(child.companyId, child.companyName);
    });

    if (companyAFilter !== ALL_COMPANIES_FILTER) {
      const company = companyOptions.find((option) => option.id === companyAFilter);
      addCompanyKey(companyAFilter, company?.name ?? null);
    }
    if (companyBFilter !== ALL_COMPANIES_FILTER) {
      const company = companyOptions.find((option) => option.id === companyBFilter);
      addCompanyKey(companyBFilter, company?.name ?? null);
    }

    return keys;
  }, [
    companyAFilter,
    companyBFilter,
    companyOptions,
    companyScopedFilterActive,
    filteredHierarchyEdges,
    filteredRelationshipLinks,
  ]);

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

  const companyAggregateEdges = useMemo<CompanyAggregateEdge[]>(() => {
    if (effectiveViewMode !== "enterprise" || wiringVisibility.showAgents) return [];

    const edges: CompanyAggregateEdge[] = [];

    if (wiringVisibility.showReportsToLines) {
      const groupedHierarchy = new Map<
        string,
        { sourceKey: string; targetKey: string; count: number }
      >();

      for (const edge of filteredHierarchyEdges) {
        const sourceKey = companyGroupKey(edge.parent.companyId, edge.parent.companyName);
        const targetKey = companyGroupKey(edge.child.companyId, edge.child.companyName);
        if (sourceKey === targetKey) continue;

        const key = `${sourceKey}->${targetKey}`;
        const existing = groupedHierarchy.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          groupedHierarchy.set(key, {
            sourceKey,
            targetKey,
            count: 1,
          });
        }
      }

      Array.from(groupedHierarchy.values()).forEach((edge, index) => {
        const source = companyGroupsMap.get(edge.sourceKey);
        const target = companyGroupsMap.get(edge.targetKey);
        if (!source || !target) return;

        const x1 = source.x + source.width / 2;
        const y1 = source.y + source.height / 2;
        const x2 = target.x + target.width / 2;
        const y2 = target.y + target.height / 2;

        edges.push({
          id: `company-hierarchy:${edge.sourceKey}:${edge.targetKey}`,
          sourceKey: edge.sourceKey,
          targetKey: edge.targetKey,
          path: companyCurvePath(source, target, index),
          labelX: (x1 + x2) / 2,
          labelY: (y1 + y2) / 2 - 20 - (index % 2) * 8,
          label: `${edge.count} reports-to link${edge.count === 1 ? "" : "s"}`,
          color: hierarchyFocusStroke,
          dashed: false,
          count: edge.count,
        });
      });
    }

    if (wiringVisibility.showRelationshipLines) {
      const groupedRelationships = new Map<
        string,
        {
          sourceKey: string;
          targetKey: string;
          count: number;
          categoryCounts: Map<EnterpriseRelationshipCategory, number>;
        }
      >();

      for (const link of filteredRelationshipLinks) {
        const sourceKey = companyGroupKey(link.sourceCompanyId, link.sourceCompanyName);
        const targetKey = companyGroupKey(link.targetCompanyId, link.targetCompanyName);
        if (sourceKey === targetKey) continue;

        const key = `${sourceKey}->${targetKey}`;
        const existing = groupedRelationships.get(key);
        if (existing) {
          existing.count += 1;
          existing.categoryCounts.set(link.category, (existing.categoryCounts.get(link.category) ?? 0) + 1);
        } else {
          groupedRelationships.set(key, {
            sourceKey,
            targetKey,
            count: 1,
            categoryCounts: new Map([[link.category, 1]]),
          });
        }
      }

      Array.from(groupedRelationships.values()).forEach((edge, index) => {
        const source = companyGroupsMap.get(edge.sourceKey);
        const target = companyGroupsMap.get(edge.targetKey);
        if (!source || !target) return;

        const x1 = source.x + source.width / 2;
        const y1 = source.y + source.height / 2;
        const x2 = target.x + target.width / 2;
        const y2 = target.y + target.height / 2;
        const rankedCategories = Array.from(edge.categoryCounts.entries()).sort(
          (left, right) => right[1] - left[1],
        );
        const dominantCategory = rankedCategories[0]?.[0] ?? "custom";
        const mixedCategories = edge.categoryCounts.size > 1;

        edges.push({
          id: `company-relationship:${edge.sourceKey}:${edge.targetKey}`,
          sourceKey: edge.sourceKey,
          targetKey: edge.targetKey,
          path: companyCurvePath(source, target, index + 12),
          labelX: (x1 + x2) / 2,
          labelY: (y1 + y2) / 2 - 20 - (index % 3) * 8,
          label: mixedCategories
            ? `${edge.count} routed link${edge.count === 1 ? "" : "s"}`
            : `${edge.count} ${relationshipCategoryLabels[dominantCategory].toLowerCase()} link${edge.count === 1 ? "" : "s"}`,
          color: mixedCategories ? chartAccent : relationshipCategoryStroke[dominantCategory],
          dashed: true,
          count: edge.count,
        });
      });
    }

    return edges;
  }, [
    chartAccent,
    companyGroupsMap,
    effectiveViewMode,
    filteredHierarchyEdges,
    filteredRelationshipLinks,
    wiringVisibility.showAgents,
    wiringVisibility.showRelationshipLines,
    wiringVisibility.showReportsToLines,
  ]);

  const selectedCompanyGroupKeys = useMemo(
    () =>
      [companyAFilter, companyBFilter].filter(
        (companyId): companyId is string =>
          companyId !== ALL_COMPANIES_FILTER && companyGroupsMap.has(companyId),
      ),
    [companyAFilter, companyBFilter, companyGroupsMap],
  );

  const companyAName =
    companyAFilter === ALL_COMPANIES_FILTER
      ? "Any company"
      : companyOptions.find((option) => option.id === companyAFilter)?.name ?? companyAFilter;

  const companyBName =
    companyBFilter === ALL_COMPANIES_FILTER
      ? "Any company"
      : companyOptions.find((option) => option.id === companyBFilter)?.name ?? companyBFilter;

  const relationshipDirectionLabel =
    relationshipDirectionFilter === "downstream"
      ? "Top-down"
      : relationshipDirectionFilter === "upstream"
        ? "Bottom-up"
        : "Two-way";

  const focusAgents = useMemo(() => {
    if (!focusTarget) return [];

    if (focusTarget.kind === "agent") {
      const match = mergedAgentMap.get(focusTarget.id) ?? graphNodeMap.get(focusTarget.id);
      return match ? [match] : [];
    }

    return departmentGroups.find((group) => group.key === focusTarget.id)?.agents ?? [];
  }, [departmentGroups, focusTarget, graphNodeMap, mergedAgentMap]);

  const focusAgentIds = useMemo(() => focusAgents.map((agent) => agent.id), [focusAgents]);

  const focusAgentIdSet = useMemo(() => new Set(focusAgentIds), [focusAgentIds]);

  const focusRelationshipLinks = useMemo(() => {
    if (focusAgentIdSet.size === 0) return [];

    return filteredRelationshipLinks.filter((link: EnterpriseGraphLink) => {
      const outbound = focusAgentIdSet.has(link.sourceAgentId);
      const inbound = focusAgentIdSet.has(link.targetAgentId);

      if (relationshipDirectionFilter === "downstream") return outbound;
      if (relationshipDirectionFilter === "upstream") return inbound;
      return outbound || inbound;
    });
  }, [filteredRelationshipLinks, focusAgentIdSet, relationshipDirectionFilter]);

  const focusHierarchyEdges = useMemo(() => {
    if (focusAgentIdSet.size === 0) return [];

    return filteredHierarchyEdges.filter(({ parent, child }) => {
      const outbound = focusAgentIdSet.has(parent.id);
      const inbound = focusAgentIdSet.has(child.id);

      if (relationshipDirectionFilter === "downstream") return outbound;
      if (relationshipDirectionFilter === "upstream") return inbound;
      return outbound || inbound;
    });
  }, [filteredHierarchyEdges, focusAgentIdSet, relationshipDirectionFilter]);

  const focusDiscoveryServices = useMemo(() => {
    if (focusAgentIds.length === 0) return [];

    const services = focusAgentIds.flatMap((agentId) => {
      const servicesForAgent = graphNodeMap.get(agentId)?.metadata?.serviceDiscoveryCache?.services ?? [];
      return servicesForAgent.map((service) => ({
        agentId,
        service,
      }));
    });

    return services
      .sort((left, right) => left.service.name.localeCompare(right.service.name))
      .slice(0, 12);
  }, [focusAgentIds, graphNodeMap]);

  const permissionItems = useMemo<InspectorPermissionItem[]>(() => {
    if (!focusTarget || focusAgents.length === 0) return [];

    return inspectorPermissionDescriptors.map((descriptor) => {
        const enabledCount = focusAgents.filter((agent) =>
          permissionFlag(
            (agent.permissions ?? {}) as unknown as Record<string, boolean | undefined>,
            descriptor.key,
          ),
        ).length;

      return {
        ...descriptor,
        itemKey: `permission:${descriptor.key}`,
        enabledCount,
        totalCount: focusAgents.length,
      };
    });
  }, [focusAgents, focusTarget]);

  const actionItems = useMemo<InspectorActionItem[]>(() => {
    if (!focusTarget) return [];

    const items: InspectorActionItem[] = [];

    if (focusHierarchyEdges.length > 0) {
      items.push({
        itemKey: "action:formal-reporting",
        label: "Formal Reporting",
        description: "Direct hierarchy edges touching the selected focus.",
        color: hierarchyFocusStroke,
        count: focusHierarchyEdges.length,
        kind: "hierarchy",
      });
    }

    const relationshipGroups = new Map<
      string,
      {
        typeKey: string;
        typeLabel: string;
        category: EnterpriseRelationshipCategory;
        count: number;
      }
    >();

    for (const link of focusRelationshipLinks) {
      const existing = relationshipGroups.get(link.typeKey);
      if (existing) {
        existing.count += 1;
      } else {
        relationshipGroups.set(link.typeKey, {
          typeKey: link.typeKey,
          typeLabel: link.typeLabel,
          category: link.category,
          count: 1,
        });
      }
    }

    const relationshipItems = Array.from(relationshipGroups.values())
      .sort((left, right) =>
        right.count === left.count
          ? left.typeLabel.localeCompare(right.typeLabel)
          : right.count - left.count,
      )
      .map((item) => ({
        itemKey: `action:type:${item.typeKey}` as const,
        label: item.typeLabel,
        description: `${relationshipCategoryLabels[item.category]} routing currently wired to this focus.`,
        color: relationshipCategoryStroke[item.category],
        count: item.count,
        kind: "relationship" as const,
        typeKey: item.typeKey,
      }));

    return [...items, ...relationshipItems];
  }, [focusHierarchyEdges, focusRelationshipLinks, focusTarget]);

  const selectedPermissionDescriptor = useMemo(() => {
    if (!selectedInspectorItem?.startsWith("permission:")) return null;

    return (
      inspectorPermissionDescriptorMap.get(
        selectedInspectorItem.replace("permission:", "") as InspectorPermissionKey,
      ) ?? null
    );
  }, [selectedInspectorItem]);

  const selectedActionItem = useMemo(
    () => actionItems.find((item) => item.itemKey === selectedInspectorItem) ?? null,
    [actionItems, selectedInspectorItem],
  );

  const overlayEdges = useMemo<FocusOverlayEdge[]>(() => {
    if (!focusTarget || focusAgentIdSet.size === 0) return [];

    const edges: FocusOverlayEdge[] = [];
    const showLabels = Boolean(selectedInspectorItem);

    const appendRelationshipEdge = (
      link: EnterpriseGraphLink,
      index: number,
      color: string,
      label: string,
    ) => {
      const source = layoutNodeMap.get(link.sourceAgentId);
      const target = layoutNodeMap.get(link.targetAgentId);
      if (!source || !target) return;

      const x1 = source.x + CARD_W / 2;
      const y1 = source.y + CARD_H / 2;
      const x2 = target.x + CARD_W / 2;
      const y2 = target.y + CARD_H / 2;

      edges.push({
        id: `overlay:${link.id}:${color}`,
        sourceAgentId: link.sourceAgentId,
        targetAgentId: link.targetAgentId,
        path: relationshipCurvePath(source, target, index),
        color,
        label,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 18 - (index % 3) * 8,
        dashed: false,
        crossCompany:
          Boolean(link.sourceCompanyId) &&
          Boolean(link.targetCompanyId) &&
          link.sourceCompanyId !== link.targetCompanyId,
        showLabel: showLabels,
      });
    };

    const appendHierarchyEdge = (
      edge: HierarchyEdge,
      index: number,
      color: string,
      label: string,
    ) => {
      edges.push({
        id: `overlay:hierarchy:${edge.parent.id}:${edge.child.id}:${color}`,
        sourceAgentId: edge.parent.id,
        targetAgentId: edge.child.id,
        path: hierarchyPath(edge.parent, edge.child),
        color,
        label,
        labelX: edge.child.x + CARD_W / 2,
        labelY: edge.child.y - 14 - (index % 2) * 7,
        dashed: false,
        crossCompany: edge.crossCompany,
        showLabel: showLabels,
      });
    };

    if (selectedPermissionDescriptor) {
      if (!wiringVisibility.showPermissions) {
        return edges;
      }

      focusRelationshipLinks
        .filter((link) => permissionMatchesLink(selectedPermissionDescriptor, link))
        .forEach((link, index) =>
          appendRelationshipEdge(link, index, selectedPermissionDescriptor.color, selectedPermissionDescriptor.shortLabel),
        );

      if (selectedPermissionDescriptor.includeHierarchy && wiringVisibility.showReportsToLines) {
        focusHierarchyEdges.forEach((edge, index) =>
          appendHierarchyEdge(edge, index, selectedPermissionDescriptor.color, selectedPermissionDescriptor.shortLabel),
        );
      }

      return edges;
    }

    if (selectedActionItem) {
      if (selectedActionItem.kind === "hierarchy") {
        if (!wiringVisibility.showReportsToLines) {
          return edges;
        }
        focusHierarchyEdges.forEach((edge, index) =>
          appendHierarchyEdge(edge, index, selectedActionItem.color, selectedActionItem.label),
        );
      } else if (selectedActionItem.typeKey) {
        if (!wiringVisibility.showRelationshipLines) {
          return edges;
        }
        focusRelationshipLinks
          .filter((link) => link.typeKey === selectedActionItem.typeKey)
          .forEach((link, index) =>
            appendRelationshipEdge(link, index, selectedActionItem.color, selectedActionItem.label),
          );
      }

      return edges;
    }

    if (wiringVisibility.showReportsToLines) {
      focusHierarchyEdges.forEach((edge, index) =>
        appendHierarchyEdge(edge, index, hierarchyFocusStroke, "Formal reporting"),
      );
    }
    if (wiringVisibility.showRelationshipLines) {
      focusRelationshipLinks.forEach((link, index) =>
        appendRelationshipEdge(link, index, relationshipCategoryStroke[link.category], link.typeLabel),
      );
    }

    return edges;
  }, [
    focusAgentIdSet,
    focusHierarchyEdges,
    focusRelationshipLinks,
    focusTarget,
    layoutNodeMap,
    selectedActionItem,
    selectedInspectorItem,
    selectedPermissionDescriptor,
    wiringVisibility.showPermissions,
    wiringVisibility.showRelationshipLines,
    wiringVisibility.showReportsToLines,
  ]);

  const overlayNodeIds = useMemo(() => {
    const nodeIds = new Set(focusAgentIds);

    for (const edge of overlayEdges) {
      nodeIds.add(edge.sourceAgentId);
      nodeIds.add(edge.targetAgentId);
    }

    return Array.from(nodeIds);
  }, [focusAgentIds, overlayEdges]);

  const hiddenInteractionCount = useMemo(() => {
    if (!focusTarget) return 0;

    return focusRelationshipLinks.filter(
      (link) =>
        !layoutNodeMap.has(link.sourceAgentId) || !layoutNodeMap.has(link.targetAgentId),
    ).length;
  }, [focusRelationshipLinks, focusTarget, layoutNodeMap]);

  const overlayMarkerColors = useMemo(
    () => Array.from(new Set(overlayEdges.map((edge) => edge.color))),
    [overlayEdges],
  );

  const focusedDepartmentGroup = useMemo(
    () =>
      focusTarget?.kind === "department"
        ? departmentGroups.find((group) => group.key === focusTarget.id) ?? null
        : null,
    [departmentGroups, focusTarget],
  );

  const focusTitle = useMemo(() => {
    if (!focusTarget) return "Select an agent or department";
    if (focusTarget.kind === "department") {
      return focusedDepartmentGroup?.label ?? "Department focus";
    }
    return focusAgents[0]?.name ?? "Agent focus";
  }, [focusAgents, focusTarget, focusedDepartmentGroup]);

  const focusSubtitle = useMemo(() => {
    if (!focusTarget) {
      return "Click a graph card or department tag to inspect permissions, actions, and live wiring.";
    }

    if (focusTarget.kind === "department") {
      return focusedDepartmentGroup
        ? `${focusedDepartmentGroup.agents.length} agent${focusedDepartmentGroup.agents.length === 1 ? "" : "s"} in ${focusedDepartmentGroup.label}.`
        : "Department focus unavailable in the current view.";
    }

    const agent = focusAgents[0];
    const department = agent ? departmentByAgentId.get(agent.id) : null;
    return department
      ? `${department.label} · ${agent?.title ?? roleLabel(agent?.role ?? "agent")}`
      : focusAgents[0]?.title ?? "Focused agent";
  }, [departmentByAgentId, focusAgents, focusTarget, focusedDepartmentGroup]);

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

  const fitToNodeIds = useCallback(
    (nodeIds: readonly string[]) => {
      if (!containerRef.current || nodeIds.length === 0) return;

      const visibleNodes = nodeIds
        .map((nodeId) => layoutNodeMap.get(nodeId))
        .filter((node): node is LayoutNode => Boolean(node));
      if (visibleNodes.length === 0) return;

      const minX = Math.min(...visibleNodes.map((node) => node.x)) - 72;
      const maxX = Math.max(...visibleNodes.map((node) => node.x + CARD_W)) + 72;
      const minY = Math.min(...visibleNodes.map((node) => node.y)) - 72;
      const maxY = Math.max(...visibleNodes.map((node) => node.y + CARD_H)) + 72;
      const width = Math.max(maxX - minX, CARD_W + 96);
      const height = Math.max(maxY - minY, CARD_H + 96);

      const containerW = containerRef.current.clientWidth;
      const containerH = containerRef.current.clientHeight;
      const scaleX = (containerW - 80) / width;
      const scaleY = (containerH - 80) / height;
      const nextZoom = Math.min(Math.max(Math.min(scaleX, scaleY, 1.45), 0.45), 1.8);

      setZoom(nextZoom);
      setPan({
        x: (containerW - width * nextZoom) / 2 - minX * nextZoom,
        y: (containerH - height * nextZoom) / 2 - minY * nextZoom,
      });
    },
    [layoutNodeMap],
  );

  const fitToCompanyGroupKeys = useCallback(
    (groupKeys: readonly string[]) => {
      if (!containerRef.current || groupKeys.length === 0) return;

      const visibleGroups = groupKeys
        .map((groupKey) => companyGroupsMap.get(groupKey))
        .filter((group): group is CompanyGroup => Boolean(group));
      if (visibleGroups.length === 0) return;

      const minX = Math.min(...visibleGroups.map((group) => group.x)) - 96;
      const maxX = Math.max(...visibleGroups.map((group) => group.x + group.width)) + 96;
      const minY = Math.min(...visibleGroups.map((group) => group.y)) - 96;
      const maxY = Math.max(...visibleGroups.map((group) => group.y + group.height)) + 96;
      const width = Math.max(maxX - minX, 320);
      const height = Math.max(maxY - minY, 220);

      const containerW = containerRef.current.clientWidth;
      const containerH = containerRef.current.clientHeight;
      const scaleX = (containerW - 80) / width;
      const scaleY = (containerH - 80) / height;
      const nextZoom = Math.min(Math.max(Math.min(scaleX, scaleY, 1.3), 0.4), 1.5);

      setZoom(nextZoom);
      setPan({
        x: (containerW - width * nextZoom) / 2 - minX * nextZoom,
        y: (containerH - height * nextZoom) / 2 - minY * nextZoom,
      });
    },
    [companyGroupsMap],
  );

  useEffect(() => {
    if (!focusTarget) return;
    if (overlayNodeIds.length === 0) return;

    fitToNodeIds(overlayNodeIds);
  }, [fitToNodeIds, focusTarget, overlayNodeIds]);

  useEffect(() => {
    if (focusTarget) return;
    if (selectedCompanyGroupKeys.length === 0) return;

    if (wiringVisibility.showAgents) {
      if (highlightedNodeIds.size === 0) return;
      fitToNodeIds(Array.from(highlightedNodeIds));
      return;
    }

    fitToCompanyGroupKeys(selectedCompanyGroupKeys);
  }, [
    fitToCompanyGroupKeys,
    fitToNodeIds,
    focusTarget,
    highlightedNodeIds,
    selectedCompanyGroupKeys,
    wiringVisibility.showAgents,
  ]);

  useEffect(() => {
    if (!focusTarget) return;

    if (focusTarget.kind === "agent" && !mergedAgentMap.has(focusTarget.id) && !graphNodeMap.has(focusTarget.id)) {
      setFocusTarget(null);
      setSelectedInspectorItem(null);
      return;
    }

    if (
      focusTarget.kind === "department" &&
      !departmentGroups.some((group) => group.key === focusTarget.id)
    ) {
      setFocusTarget(null);
      setSelectedInspectorItem(null);
    }
  }, [departmentGroups, focusTarget, graphNodeMap, mergedAgentMap]);

  const handleFocusAgent = useCallback((agentId: string) => {
    if (effectiveViewMode === "hierarchy") {
      setCollapsedNodeIds(new Set());
    }
    setFocusTarget({ kind: "agent", id: agentId });
    setSelectedInspectorItem(null);
  }, [effectiveViewMode]);

  const handleFocusDepartment = useCallback((departmentKey: AgentDepartmentKey) => {
    if (effectiveViewMode === "hierarchy") {
      setCollapsedNodeIds(new Set());
    }
    setFocusTarget({ kind: "department", id: departmentKey });
    setSelectedInspectorItem(null);
  }, [effectiveViewMode]);

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

  const resetEnterpriseFilters = useCallback(() => {
    setRelationshipCategoryFilter("all");
    setRelationshipDirectionFilter("both");
    setCompanyAFilter(ALL_COMPANIES_FILTER);
    setCompanyBFilter(ALL_COMPANIES_FILTER);
    setWiringVisibility(createDefaultWiringVisibility(effectiveViewMode));
    setSelectedInspectorItem(null);
  }, [effectiveViewMode]);

  const handleWiringVisibilityChange = useCallback(
    (key: keyof WiringVisibilityState, checked: boolean) => {
      setWiringVisibility((previous) => {
        const next: WiringVisibilityState = {
          ...previous,
          [key]: checked,
        };

        if (key === "showAgents") {
          if (!checked) {
            next.showAgentNames = false;
            next.showPermissions = false;
          }
        }

        if (key === "showAgentNames" && checked) {
          next.showAgents = true;
        }

        if (key === "showPermissions" && checked) {
          next.showAgents = true;
        }

        return next;
      });
    },
    [],
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

  const createExportPayload = useCallback((): OrgChartExportPayload => {
    const generatedAt = new Date();
    const companyName = selectedCompany?.name ?? "Selected company";
    const relationshipFilterParts = [
      relationshipCategoryFilter === "all"
        ? "all categories"
        : relationshipCategoryLabels[relationshipCategoryFilter],
    ];

    if (relationshipDirectionFilter !== "both") {
      relationshipFilterParts.push(
        relationshipDirectionFilter === "downstream" ? "top-down" : "bottom-up",
      );
    }

    if (companyAFilter !== ALL_COMPANIES_FILTER) {
      relationshipFilterParts.push(
        `A:${companyOptions.find((option) => option.id === companyAFilter)?.name ?? companyAFilter}`,
      );
    }

    if (companyBFilter !== ALL_COMPANIES_FILTER) {
      relationshipFilterParts.push(
        `B:${companyOptions.find((option) => option.id === companyBFilter)?.name ?? companyBFilter}`,
      );
    }

    return {
      fileBaseName: buildOrgChartExportBaseName(companyName, pageTitle, effectiveViewMode, generatedAt),
      title: pageTitle,
      subtitle: pageSubtitle,
      companyId: selectedCompanyId!,
      companyName,
      viewMode: effectiveViewMode,
      generatedAt: generatedAt.toISOString(),
      chartAccent,
      relationshipFilter: relationshipFilterParts.join(" · "),
      bounds,
      roots: activeRoots,
      nodes: allNodes,
      hierarchyEdges: filteredHierarchyEdges,
      secondaryEdges,
      companyGroups,
      workflowPacks: enterpriseGraph?.workflowPacks ?? [],
    };
  }, [
    activeRoots,
    allNodes,
    bounds,
    chartAccent,
    companyAFilter,
    companyBFilter,
    companyGroups,
    companyOptions,
    effectiveViewMode,
    enterpriseGraph?.workflowPacks,
    filteredHierarchyEdges,
    pageSubtitle,
    pageTitle,
    relationshipCategoryFilter,
    relationshipDirectionFilter,
    secondaryEdges,
    selectedCompany?.name,
    selectedCompanyId,
  ]);

  const handleExportMenuToggle = useCallback(() => {
    setExportError(null);
    setExportMenuOpen((previous) => !previous);
  }, []);

  const handleStructureExport = useCallback(
    async (format: OrgChartExportFormat) => {
      setExportingFormat(format);
      setExportError(null);

      try {
        await downloadOrgChartExport(format, createExportPayload());
        setExportMenuOpen(false);
      } catch (error) {
        setExportError(
          error instanceof Error ? error.message : "The structure export could not be generated.",
        );
      } finally {
        setExportingFormat(null);
      }
    },
    [createExportPayload],
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

          <div className="flex items-center gap-2">
            <ExportMenuButton
              open={exportMenuOpen}
              busyFormat={exportingFormat}
              error={exportError}
              menuRef={exportMenuRef}
              onToggle={handleExportMenuToggle}
              onExport={handleStructureExport}
            />
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
            <ExportMenuButton
              open={exportMenuOpen}
              busyFormat={exportingFormat}
              error={exportError}
              menuRef={exportMenuRef}
              onToggle={handleExportMenuToggle}
              onExport={handleStructureExport}
            />
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

      {effectiveViewMode === "enterprise" && enterpriseGraph ? (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-gradient-to-r from-card/95 via-card/88 to-muted/45 px-3 py-3 shadow-sm dark:border-white/10 dark:from-slate-950/88 dark:via-slate-950/78 dark:to-slate-900/68">
            <Button
              size="sm"
              variant={filtersOpen ? "default" : "outline"}
              onClick={() => setFiltersOpen((previous) => !previous)}
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              {filtersOpen ? "Hide filters" : "Show filters"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInspectorMinimized((previous) => !previous)}
            >
              {inspectorMinimized ? (
                <Eye className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <EyeOff className="mr-1.5 h-3.5 w-3.5" />
              )}
              {inspectorMinimized ? "Show inspector" : "Minimize inspector"}
            </Button>
            <Button size="sm" variant="outline" onClick={resetEnterpriseFilters}>
              Reset filters
            </Button>

            <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-border/70 bg-background/75 px-2.5 py-1 dark:border-white/10 dark:bg-slate-950/70">
                {enterpriseScope === "family" ? "Family-wide structure" : "Company structure"}
              </span>
              <span className="rounded-full border border-border/70 bg-background/75 px-2.5 py-1 dark:border-white/10 dark:bg-slate-950/70">
                {companyGroups.length} compan{companyGroups.length === 1 ? "y" : "ies"}
              </span>
              <span className="rounded-full border border-border/70 bg-background/75 px-2.5 py-1 dark:border-white/10 dark:bg-slate-950/70">
                {filteredHierarchyEdges.length} reports-to links
              </span>
              <span className="rounded-full border border-border/70 bg-background/75 px-2.5 py-1 dark:border-white/10 dark:bg-slate-950/70">
                {filteredRelationshipLinks.length} routed links
              </span>
              {(companyAFilter !== ALL_COMPANIES_FILTER || companyBFilter !== ALL_COMPANIES_FILTER) ? (
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-sky-700 dark:text-sky-200">
                  {companyAName} · {relationshipDirectionLabel} · {companyBName}
                </span>
              ) : null}
            </div>
          </div>

          {!fullscreen ? (
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
          ) : null}
        </>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row">
        {effectiveViewMode === "enterprise" && filtersOpen ? (
          <aside
            className={cn(
              "flex min-h-[320px] shrink-0 flex-col rounded-2xl border border-border/70 bg-gradient-to-br from-card/95 via-card/90 to-muted/50 p-3 shadow-sm dark:border-white/10 dark:from-slate-950/90 dark:via-slate-950/84 dark:to-slate-900/74",
              fullscreen ? "xl:w-[330px]" : "xl:w-[310px]",
            )}
          >
            <div className="border-b border-border/70 pb-3 dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Enterprise Filters</div>
                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Compare Company A to Company B, switch relationship direction, and choose
                    exactly which layers are visible.
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setFiltersOpen(false)}>
                  Hide
                </Button>
              </div>
            </div>

            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-auto pr-1">
              <div className="rounded-xl border border-border/70 bg-background/55 p-3 dark:border-white/10 dark:bg-slate-950/45">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Compare
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {relationshipDirectionLabel}
                  </span>
                </div>

                <div className="mt-3 space-y-3">
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-foreground/80">Company A</div>
                    <Select value={companyAFilter} onValueChange={setCompanyAFilter}>
                      <SelectTrigger className="w-full justify-between bg-background/80">
                        <SelectValue placeholder="Select company A" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_COMPANIES_FILTER}>Any company</SelectItem>
                        {companyOptions.map((option) => (
                          <SelectItem key={`company-a:${option.id}`} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-foreground/80">Company B</div>
                    <Select value={companyBFilter} onValueChange={setCompanyBFilter}>
                      <SelectTrigger className="w-full justify-between bg-background/80">
                        <SelectValue placeholder="Select company B" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_COMPANIES_FILTER}>Any company</SelectItem>
                        {companyOptions.map((option) => (
                          <SelectItem key={`company-b:${option.id}`} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-foreground/80">
                      Relationship direction
                    </div>
                    <Select
                      value={relationshipDirectionFilter}
                      onValueChange={(value) =>
                        setRelationshipDirectionFilter(value as RelationshipDirectionFilter)
                      }
                    >
                      <SelectTrigger className="w-full justify-between bg-background/80">
                        <SelectValue placeholder="Choose direction" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Both directions</SelectItem>
                        <SelectItem value="downstream">Top-down only</SelectItem>
                        <SelectItem value="upstream">Bottom-up only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/55 p-3 dark:border-white/10 dark:bg-slate-950/45">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Relationship Types
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {filteredRelationshipLinks.length} visible
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
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
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/55 p-3 dark:border-white/10 dark:bg-slate-950/45">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Visibility
                  </div>
                  <span className="text-[10px] text-muted-foreground">Live layer controls</span>
                </div>

                <div className="mt-3 space-y-2.5">
                  {[
                    {
                      key: "showCompanyContainers",
                      label: "Company boxes",
                      description: "Show or hide the company containers in the enterprise map.",
                    },
                    {
                      key: "showCompanyNames",
                      label: "Company names",
                      description: "Show or hide company labels in the chart and grouping shells.",
                    },
                    {
                      key: "showAgents",
                      label: "Agent cards",
                      description: "Show individual agents or collapse to company-to-company wiring.",
                    },
                    {
                      key: "showAgentNames",
                      label: "Agent names",
                      description: "Keep cards visible but hide personal labels and card detail.",
                    },
                    {
                      key: "showPermissions",
                      label: "Permissions",
                      description: "Show permission overlays inside the Wiring Inspector.",
                    },
                    {
                      key: "showReportsToLines",
                      label: "Reports-to lines",
                      description: "Show or hide formal hierarchy wiring between managers and reports.",
                    },
                    {
                      key: "showRelationshipLines",
                      label: "Relationship lines",
                      description: "Show or hide cross-functional wiring and enterprise relationships.",
                    },
                  ].map((item) => {
                    const checked = wiringVisibility[item.key as keyof WiringVisibilityState];
                    return (
                      <label
                        key={item.key}
                        className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/65"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(nextChecked) =>
                            handleWiringVisibilityChange(
                              item.key as keyof WiringVisibilityState,
                              nextChecked === true,
                            )
                          }
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block text-[12px] font-medium text-foreground">
                            {item.label}
                          </span>
                          <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
                            {item.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/55 p-3 dark:border-white/10 dark:bg-slate-950/45">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Quick Presets
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setWiringVisibility({
                        showCompanyContainers: true,
                        showCompanyNames: true,
                        showAgents: false,
                        showAgentNames: false,
                        showPermissions: false,
                        showReportsToLines: true,
                        showRelationshipLines: true,
                      })
                    }
                  >
                    Companies only
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setWiringVisibility({
                        showCompanyContainers: true,
                        showCompanyNames: true,
                        showAgents: true,
                        showAgentNames: true,
                        showPermissions: true,
                        showReportsToLines: true,
                        showRelationshipLines: true,
                      })
                    }
                  >
                    Full detail
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetEnterpriseFilters}>
                    Restore defaults
                  </Button>
                </div>
              </div>
            </div>
          </aside>
        ) : null}

        <div
          ref={containerRef}
          className={cn(
            "relative min-h-[440px] min-w-0 flex-1 overflow-hidden border border-border/70 bg-gradient-to-br from-slate-100/70 via-background to-slate-200/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:border-white/10 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/90",
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

          <div className="absolute left-3 top-3 z-10 max-w-xs rounded-2xl border border-border/70 bg-background/92 p-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-slate-950/82">
            <div className="text-sm font-semibold text-foreground">
              {effectiveViewMode === "enterprise" ? "Enterprise overlay" : "Hierarchy overlay"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Click a card to focus an agent. Click a department chip to aggregate routing across that team.
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
              <div className="flex items-center gap-2 text-[11px] text-foreground/80">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hierarchyFocusStroke }} />
                <span>Formal reporting</span>
              </div>
            </div>
          </div>

          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <defs>
              {overlayMarkerColors.map((color) => {
                const markerId = `overlay-arrow-${sanitizeMarkerId(color)}`;
                return (
                  <marker
                    key={markerId}
                    id={markerId}
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L8,4 L0,8 z" fill={color} />
                  </marker>
                );
              })}
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {(wiringVisibility.showCompanyContainers || wiringVisibility.showCompanyNames)
                ? companyGroups.map((group) => {
                    const groupHighlighted =
                      !companyScopedFilterActive || highlightedCompanyKeys.has(group.key);

                    return (
                      <g key={group.key} opacity={groupHighlighted ? 1 : 0.24}>
                        {wiringVisibility.showCompanyContainers ? (
                          <>
                            <rect
                              x={group.x}
                              y={group.y}
                              width={group.width}
                              height={group.height}
                              rx={26}
                              fill={`${group.accentColor}16`}
                              stroke={`${group.accentColor}${groupHighlighted ? "88" : "44"}`}
                              strokeWidth={groupHighlighted ? 1.75 : 1.2}
                            />
                            <line
                              x1={group.x + 18}
                              y1={group.y + COMPANY_GROUP_HEADER_H}
                              x2={group.x + group.width - 18}
                              y2={group.y + COMPANY_GROUP_HEADER_H}
                              stroke={`${group.accentColor}${groupHighlighted ? "66" : "32"}`}
                              strokeWidth={1}
                            />
                          </>
                        ) : null}

                        {wiringVisibility.showCompanyNames ? (
                          <>
                            <text
                              x={group.x + 20}
                              y={group.y + 27}
                              fill="currentColor"
                              className="text-[13px] font-semibold text-foreground"
                            >
                              {group.companyName}
                            </text>
                            <text
                              x={group.x + 20}
                              y={group.y + 41}
                              fill="currentColor"
                              className="text-[10px] text-muted-foreground"
                            >
                              {group.nodeCount} agent{group.nodeCount === 1 ? "" : "s"}
                            </text>
                          </>
                        ) : null}
                      </g>
                    );
                  })
                : null}

              {wiringVisibility.showAgents && wiringVisibility.showReportsToLines
                ? filteredHierarchyEdges.map(({ parent, child, crossCompany }) => {
                    const edgeHighlighted =
                      !companyScopedFilterActive ||
                      highlightedNodeIds.has(parent.id) ||
                      highlightedNodeIds.has(child.id);

                    return (
                      <path
                        key={`${parent.id}-${child.id}`}
                        d={hierarchyPath(parent, child)}
                        fill="none"
                        stroke={crossCompany ? CROSS_COMPANY_STROKE : DEFAULT_EDGE_STROKE}
                        strokeWidth={crossCompany ? 2.25 : 1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={edgeHighlighted ? 0.95 : 0.16}
                      />
                    );
                  })
                : null}

              {wiringVisibility.showAgents && wiringVisibility.showRelationshipLines
                ? secondaryEdges.map((edge) => {
                    const stroke = edge.crossCompany
                      ? CROSS_COMPANY_STROKE
                      : relationshipCategoryStroke[edge.category];
                    const labelWidth = Math.max(edge.typeLabel.length * 6.25 + 22, 92);
                    const edgeHighlighted =
                      !companyScopedFilterActive ||
                      highlightedNodeIds.has(edge.sourceAgentId) ||
                      highlightedNodeIds.has(edge.targetAgentId);

                    return (
                      <g key={edge.id} opacity={edgeHighlighted ? 1 : 0.16}>
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
                        <text
                          x={edge.labelX}
                          y={edge.labelY + 3}
                          textAnchor="middle"
                          fill="#f8fafc"
                          className="text-[10px] font-medium"
                        >
                          {edge.typeLabel}
                        </text>
                      </g>
                    );
                  })
                : null}

              {!wiringVisibility.showAgents
                ? companyAggregateEdges.map((edge) => {
                    const labelWidth = Math.max(edge.label.length * 6.35 + 22, 108);
                    const edgeHighlighted =
                      !companyScopedFilterActive ||
                      highlightedCompanyKeys.has(edge.sourceKey) ||
                      highlightedCompanyKeys.has(edge.targetKey);

                    return (
                      <g key={edge.id} opacity={edgeHighlighted ? 1 : 0.2}>
                        <path
                          d={edge.path}
                          fill="none"
                          stroke={edge.color}
                          strokeDasharray={edge.dashed ? "10 6" : undefined}
                          strokeWidth={edge.dashed ? 2.5 : 2.1}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <rect
                          x={edge.labelX - labelWidth / 2}
                          y={edge.labelY - 10}
                          width={labelWidth}
                          height={20}
                          rx={10}
                          fill="rgba(15,23,42,0.88)"
                          stroke={edge.color}
                          strokeWidth={0.85}
                        />
                        <text
                          x={edge.labelX}
                          y={edge.labelY + 3}
                          textAnchor="middle"
                          fill="#f8fafc"
                          className="text-[10px] font-medium"
                        >
                          {edge.label}
                        </text>
                      </g>
                    );
                  })
                : null}

              {overlayEdges.map((edge) => {
                const labelWidth = Math.max(edge.label.length * 6.2 + 22, 90);
                return (
                  <g key={edge.id}>
                    <path
                      d={edge.path}
                      fill="none"
                      stroke={edge.color}
                      strokeWidth={3.35}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      markerEnd={`url(#overlay-arrow-${sanitizeMarkerId(edge.color)})`}
                      opacity={0.96}
                    />
                    {edge.showLabel ? (
                      <>
                        <rect
                          x={edge.labelX - labelWidth / 2}
                          y={edge.labelY - 10}
                          width={labelWidth}
                          height={20}
                          rx={10}
                          fill="rgba(15,23,42,0.92)"
                          stroke={edge.color}
                          strokeWidth={0.9}
                        />
                        <text
                          x={edge.labelX}
                          y={edge.labelY + 3}
                          textAnchor="middle"
                          fill="#f8fafc"
                          className="text-[10px] font-semibold"
                        >
                          {edge.label}
                        </text>
                      </>
                    ) : null}
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
            {wiringVisibility.showAgents || effectiveViewMode !== "enterprise"
              ? allNodes.map((node) => {
                  const agent = mergedAgentMap.get(node.id);
                  const graphNode = graphNodeMap.get(node.id);
                  const department = agent ? departmentByAgentId.get(agent.id) : null;
                  const dotColor = statusDotColor[node.status] ?? defaultDotColor;
                  const baseCardAccent = node.externalToCompany ? "#f59e0b" : chartAccent;
                  const isFocusedAgent = focusAgentIdSet.has(node.id);
                  const isConnectedOverlayNode =
                    !isFocusedAgent && overlayNodeIds.includes(node.id);
                  const nodeHighlighted =
                    !companyScopedFilterActive ||
                    highlightedNodeIds.has(node.id) ||
                    highlightedCompanyKeys.has(companyGroupKey(node.companyId, node.companyName)) ||
                    isFocusedAgent ||
                    isConnectedOverlayNode;
                  const showCompanyBadge =
                    wiringVisibility.showCompanyNames &&
                    Boolean(node.companyName) &&
                    (effectiveViewMode === "enterprise" || Boolean(node.externalToCompany));
                  const showAgentText =
                    effectiveViewMode !== "enterprise" || wiringVisibility.showAgentNames;

                  return (
                    <div
                      key={node.id}
                      data-org-card
                      className={cn(
                        "absolute cursor-pointer select-none overflow-hidden rounded-2xl border bg-gradient-to-br from-card/95 via-card to-muted/40 shadow-[0_18px_35px_-24px_rgba(15,23,42,0.55)] transition-[box-shadow,border-color,transform,opacity] duration-150 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_24px_50px_-28px_rgba(15,23,42,0.7)] dark:from-slate-950/92 dark:via-slate-950/88 dark:to-slate-900/72",
                        isFocusedAgent
                          ? "border-transparent shadow-[0_28px_64px_-26px_rgba(14,165,233,0.55)]"
                          : isConnectedOverlayNode
                            ? "border-transparent shadow-[0_24px_56px_-28px_rgba(34,197,94,0.35)]"
                            : "border-border/70 dark:border-white/10",
                      )}
                      style={{
                        left: node.x,
                        top: node.y,
                        minHeight: CARD_H,
                        width: CARD_W,
                        opacity: nodeHighlighted ? 1 : 0.34,
                        boxShadow: isFocusedAgent
                          ? `0 0 0 2px ${selectedPermissionDescriptor?.color ?? selectedActionItem?.color ?? chartAccent}, 0 22px 48px -28px rgba(15,23,42,0.7)`
                          : isConnectedOverlayNode
                            ? "0 0 0 1.5px rgba(148,163,184,0.7), 0 18px 42px -28px rgba(15,23,42,0.6)"
                            : undefined,
                      }}
                      onClick={() => handleFocusAgent(node.id)}
                      onDoubleClick={() => navigate(agent ? agentUrl(agent) : `/agents/${node.id}`)}
                      title="Click to inspect wiring. Double-click to open the agent."
                    >
                      <div
                        className="absolute inset-x-0 top-0 h-1"
                        style={{
                          background: `linear-gradient(90deg, ${
                            isFocusedAgent
                              ? selectedPermissionDescriptor?.color ??
                                selectedActionItem?.color ??
                                baseCardAccent
                              : baseCardAccent
                          }, transparent)`,
                        }}
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
                            <AgentIcon
                              icon={agent?.icon}
                              className="h-4.5 w-4.5 text-foreground/70"
                            />
                          </div>
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
                            style={{ backgroundColor: dotColor }}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          {showAgentText ? (
                            <>
                              <div className="pr-9 text-sm font-semibold leading-tight text-foreground">
                                {node.name}
                              </div>
                              <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                                {agent?.title ?? roleLabel(node.role)}
                              </div>
                            </>
                          ) : (
                            <div className="pr-9 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Agent hidden
                            </div>
                          )}

                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {department ? (
                              <button
                                type="button"
                                className={cn(
                                  "inline-flex max-w-full rounded-full border px-2 py-0.5 text-[10px] leading-tight transition-colors",
                                  focusTarget?.kind === "department" &&
                                    focusTarget.id === department.key
                                    ? "border-transparent bg-foreground text-background"
                                    : "border-foreground/10 bg-foreground/[0.05] text-foreground/80 hover:bg-foreground/[0.12]",
                                )}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleFocusDepartment(department.key);
                                }}
                              >
                                {department.shortLabel} · {department.label}
                              </button>
                            ) : null}

                            {showCompanyBadge ? (
                              <div className="inline-flex max-w-full rounded-full border border-foreground/10 bg-foreground/[0.05] px-2 py-0.5 text-[10px] leading-tight text-foreground/80">
                                {node.companyName}
                              </div>
                            ) : null}
                          </div>

                          {agent && showAgentText ? (
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

                          {agent?.capabilities && showAgentText ? (
                            <div className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted-foreground/80">
                              {agent.capabilities}
                            </div>
                          ) : null}

                          {graphNode && showAgentText ? (
                            <div className="mt-1 text-[10px] leading-tight text-foreground/70">
                              {graphNode.secondaryLinkCount ?? 0} secondary link
                              {(graphNode.secondaryLinkCount ?? 0) === 1 ? "" : "s"}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              : null}
          </div>
        </div>

        {inspectorMinimized ? (
          <aside
            className={cn(
              "flex min-h-[320px] shrink-0 items-stretch rounded-2xl border border-border/70 bg-gradient-to-br from-card/95 via-card/90 to-muted/45 shadow-sm dark:border-white/10 dark:from-slate-950/90 dark:via-slate-950/84 dark:to-slate-900/72",
              fullscreen ? "xl:w-[74px]" : "xl:w-[68px]",
            )}
          >
            <button
              type="button"
              className="flex w-full flex-col items-center justify-center gap-3 px-2 py-4 text-center transition-colors hover:bg-accent/50"
              onClick={() => setInspectorMinimized(false)}
              title="Open Wiring Inspector"
            >
              <Eye className="h-4.5 w-4.5 text-foreground/80" />
              <span className="-rotate-90 whitespace-nowrap text-[11px] font-semibold text-foreground/80">
                Wiring Inspector
              </span>
              {focusTarget ? (
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-700 dark:text-sky-200">
                  Live
                </span>
              ) : null}
            </button>
          </aside>
        ) : (
          <aside
            className={cn(
              "flex min-h-[320px] shrink-0 flex-col rounded-2xl border border-border/70 bg-gradient-to-br from-card/95 via-card/90 to-muted/45 p-3 shadow-sm dark:border-white/10 dark:from-slate-950/90 dark:via-slate-950/84 dark:to-slate-900/72",
              fullscreen ? "xl:w-[360px]" : "xl:w-[340px]",
            )}
          >
            <div className="border-b border-border/70 pb-3 dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Wiring Inspector</div>
                  <div className="mt-1 text-xs text-muted-foreground">{focusSubtitle}</div>
                </div>
                <div className="flex items-center gap-2">
                  {focusTarget ? (
                    <button
                      type="button"
                      className="rounded-full border border-border/70 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:border-white/10"
                      onClick={() => {
                        setFocusTarget(null);
                        setSelectedInspectorItem(null);
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full border border-border/70 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:border-white/10"
                    onClick={() => setInspectorMinimized(true)}
                    title="Minimize inspector"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-2 text-sm font-medium text-foreground">{focusTitle}</div>
            </div>

            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <div className="rounded-xl border border-border/70 bg-background/55 p-3 dark:border-white/10 dark:bg-slate-950/45">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Departments
                </div>
                <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-auto pr-1">
                  {departmentGroups.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                        focusTarget?.kind === "department" && focusTarget.id === group.key
                          ? "border-transparent bg-foreground text-background"
                          : "border-border/70 bg-background/80 text-foreground/80 hover:bg-accent dark:border-white/10 dark:bg-slate-950/65",
                      )}
                      onClick={() => handleFocusDepartment(group.key)}
                    >
                      {group.shortLabel} · {group.agents.length}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/55 p-3 dark:border-white/10 dark:bg-slate-950/45">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Agent Index
                </div>
                <div className="mt-2 max-h-44 space-y-1 overflow-auto pr-1">
                  {(focusedDepartmentGroup?.agents ?? inspectorAgents).map((agent) => {
                    const department = departmentByAgentId.get(agent.id);
                    const active = focusTarget?.kind === "agent" && focusTarget.id === agent.id;
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl border px-2.5 py-2 text-left transition-colors",
                          active
                            ? "border-transparent bg-foreground text-background"
                            : "border-border/70 bg-background/80 hover:bg-accent dark:border-white/10 dark:bg-slate-950/65",
                        )}
                        onClick={() => handleFocusAgent(agent.id)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-medium">{agent.name}</span>
                          <span
                            className={cn(
                              "block truncate text-[10px]",
                              active ? "text-background/70" : "text-muted-foreground",
                            )}
                          >
                            {department?.shortLabel ?? "GEN"} ·{" "}
                            {agent.title ?? roleLabel(agent.role ?? "agent")}
                          </span>
                        </span>
                        {focusAgentIdSet.has(agent.id) ? (
                          <span className="text-[10px] font-semibold">Live</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
                {wiringVisibility.showPermissions ? (
                  <div className="rounded-xl border border-border/70 bg-background/55 p-3 dark:border-white/10 dark:bg-slate-950/45">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Permissions
                      </div>
                      {focusTarget ? (
                        <span className="text-[10px] text-muted-foreground">
                          {focusAgents.length} focus agent{focusAgents.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>

                    {focusTarget ? (
                      <div className="mt-2 space-y-1.5">
                        {permissionItems.map((item) => {
                          const active = selectedInspectorItem === item.itemKey;
                          const disabled = item.enabledCount === 0;
                          return (
                            <button
                              key={item.itemKey}
                              type="button"
                              className={cn(
                                "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                                active
                                  ? "border-transparent text-background"
                                  : "border-border/70 bg-background/80 hover:bg-accent dark:border-white/10 dark:bg-slate-950/65",
                              )}
                              style={active ? { backgroundColor: item.color } : undefined}
                              onClick={() =>
                                setSelectedInspectorItem((current) =>
                                  current === item.itemKey ? null : item.itemKey,
                                )
                              }
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[12px] font-medium">{item.label}</span>
                                <span
                                  className={cn(
                                    "text-[10px]",
                                    active
                                      ? "text-background/75"
                                      : disabled
                                        ? "text-red-500"
                                        : "text-muted-foreground",
                                  )}
                                >
                                  {item.enabledCount}/{item.totalCount}
                                </span>
                              </div>
                              <div
                                className={cn(
                                  "mt-1 text-[10px] leading-relaxed",
                                  active ? "text-background/75" : "text-muted-foreground",
                                )}
                              >
                                {item.description}
                                {item.includeDiscovery && focusDiscoveryServices.length > 0
                                  ? ` ${focusDiscoveryServices.length} discovery record${focusDiscoveryServices.length === 1 ? "" : "s"} currently cached.`
                                  : ""}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        Select a focus target first. The permission list becomes clickable and
                        will drive the graph arrows.
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="rounded-xl border border-border/70 bg-background/55 p-3 dark:border-white/10 dark:bg-slate-950/45">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Actions
                  </div>

                  {focusTarget ? (
                    <div className="mt-2 space-y-1.5">
                      {actionItems.length > 0 ? (
                        actionItems.map((item) => {
                          const active = selectedInspectorItem === item.itemKey;
                          return (
                            <button
                              key={item.itemKey}
                              type="button"
                              className={cn(
                                "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                                active
                                  ? "border-transparent text-background"
                                  : "border-border/70 bg-background/80 hover:bg-accent dark:border-white/10 dark:bg-slate-950/65",
                              )}
                              style={active ? { backgroundColor: item.color } : undefined}
                              onClick={() =>
                                setSelectedInspectorItem((current) =>
                                  current === item.itemKey ? null : item.itemKey,
                                )
                              }
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[12px] font-medium">{item.label}</span>
                                <span
                                  className={cn(
                                    "text-[10px]",
                                    active ? "text-background/75" : "text-muted-foreground",
                                  )}
                                >
                                  {item.count}
                                </span>
                              </div>
                              <div
                                className={cn(
                                  "mt-1 text-[10px] leading-relaxed",
                                  active ? "text-background/75" : "text-muted-foreground",
                                )}
                              >
                                {item.description}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="text-[11px] leading-relaxed text-muted-foreground">
                          No routed actions are wired to this focus yet.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      Action routes appear here once you focus an agent or department.
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border/70 bg-background/55 p-3 dark:border-white/10 dark:bg-slate-950/45">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Live Discovery
                  </div>
                  {focusTarget ? (
                    <div className="mt-2 space-y-1.5">
                      {focusDiscoveryServices.length > 0 ? (
                        focusDiscoveryServices.map(({ agentId, service }) => (
                          <div
                            key={`${agentId}:${service.id}`}
                            className="rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-left dark:border-white/10 dark:bg-slate-950/65"
                          >
                            <div className="text-[12px] font-medium text-foreground">
                              {service.name}
                            </div>
                            <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                              {service.kind} · {service.hostKind}
                              {service.endpoint ? ` · ${service.endpoint}` : ""}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-[11px] leading-relaxed text-muted-foreground">
                          No service discovery cache is attached to the current focus.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      Discovery details are shown for the selected focus to help verify live
                      wiring.
                    </div>
                  )}
                </div>

                {focusTarget && hiddenInteractionCount > 0 ? (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-200">
                    {hiddenInteractionCount} routed interaction
                    {hiddenInteractionCount === 1 ? "" : "s"} sit outside the current layout.
                    Switch to the enterprise-wide view to inspect those paths directly.
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
