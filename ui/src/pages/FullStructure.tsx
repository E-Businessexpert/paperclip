import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  Company,
  EnterpriseGraphLink,
  EnterpriseGraphNode,
  EnterpriseGraphOrgNode,
} from "@paperclipai/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  GitBranch,
  Maximize2,
  Minimize2,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { Link, useLocation, useParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { agentsApi } from "../api/agents";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

type TierFilter = "all" | string;
type CompanyWireKind = "hierarchy" | "relationship";

interface CompanyBlueprint {
  company: Company;
  hierarchyLevel: number;
  agents: EnterpriseGraphNode[];
  hierarchyIncoming: CompanyWireEdge[];
  hierarchyOutgoing: CompanyWireEdge[];
  relationshipIncoming: CompanyWireEdge[];
  relationshipOutgoing: CompanyWireEdge[];
  services: string[];
}

interface CompanyWireEdge {
  key: string;
  sourceCompanyId: string;
  sourceCompanyName: string | null;
  targetCompanyId: string;
  targetCompanyName: string | null;
  category: string;
  label: string;
  count: number;
  kind: CompanyWireKind;
}

interface CompanyGraphNode {
  blueprint: CompanyBlueprint;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CompanyGraphEdge {
  key: string;
  source: CompanyGraphNode;
  target: CompanyGraphNode;
  category: string;
  label: string;
  count: number;
  kind: CompanyWireKind;
}

interface CompanyGraphLayout {
  width: number;
  height: number;
  nodes: CompanyGraphNode[];
  edges: CompanyGraphEdge[];
}

// Backend contract name for the cross-company graph; the UI presents it as the global structure.
const CROSS_COMPANY_GRAPH_SCOPE = "family" as const;
const GRAPH_NODE_WIDTH = 246;
const GRAPH_NODE_HEIGHT = 118;
const GRAPH_COLUMN_GAP = 58;
const GRAPH_ROW_GAP = 190;
const GRAPH_MARGIN_X = 86;

function blueprintSort(left: CompanyBlueprint, right: CompanyBlueprint): number {
  const levelDelta = left.hierarchyLevel - right.hierarchyLevel;
  if (levelDelta !== 0) return levelDelta;
  return left.company.name.localeCompare(right.company.name);
}

function hierarchyTierLabel(level: number): string {
  return `Tier ${level + 1}`;
}

function hierarchyTierDescription(level: number): string {
  return level === 0
    ? "Route roots and companies with no upstream inter-company reporting parent."
    : `Companies reached ${level} inter-company reporting step${level === 1 ? "" : "s"} below the route roots.`;
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function agentServiceLabel(agent: EnterpriseGraphNode): string {
  return agent.title || formatLabel(agent.role) || agent.name;
}

function deriveServices(agents: EnterpriseGraphNode[]): string[] {
  const seen = new Set<string>();
  const services: string[] = [];

  for (const agent of agents) {
    const label = agentServiceLabel(agent);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    services.push(label);
    if (services.length === 3) break;
  }

  return services;
}

function relationshipSummary(links: CompanyWireEdge[]): Array<{ key: string; label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>();

  for (const link of links) {
    const current = counts.get(link.category) ?? { label: formatLabel(link.category), count: 0 };
    current.count += link.count;
    counts.set(link.category, current);
  }

  return [...counts.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 8);
}

function companyDescription(company: Company): string {
  if (company.description) return company.description;

  return "A company in the live route-derived structure. Its position is based on reporting hierarchy and inter-company wiring.";
}

function matchesBlueprintSearch(blueprint: CompanyBlueprint, searchTerm: string): boolean {
  if (!searchTerm) return true;
  const haystack = [
    blueprint.company.name,
    blueprint.company.issuePrefix,
    hierarchyTierLabel(blueprint.hierarchyLevel),
    ...blueprint.services,
  ].join(" ").toLowerCase();

  return haystack.includes(searchTerm);
}

function hasRelationshipCategory(blueprint: CompanyBlueprint, category: string): boolean {
  if (category === "all") return true;
  return (
    blueprint.hierarchyIncoming.some((link) => link.category === category)
    || blueprint.hierarchyOutgoing.some((link) => link.category === category)
    || blueprint.relationshipIncoming.some((link) => link.category === category)
    || blueprint.relationshipOutgoing.some((link) => link.category === category)
  );
}

function splitLabel(value: string, maxLineLength = 23): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLineLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length === 2) break;
  }

  if (current && lines.length < 2) lines.push(current);
  return lines.length > 0 ? lines : [value];
}

function collectCompanyHierarchyEdges(roots: EnterpriseGraphOrgNode[]): CompanyWireEdge[] {
  const edgeCounts = new Map<string, CompanyWireEdge>();

  function visit(node: EnterpriseGraphOrgNode, parent: EnterpriseGraphOrgNode | null) {
    if (parent && parent.companyId !== node.companyId) {
      const key = `${parent.companyId}:${node.companyId}:reports-to`;
      const current = edgeCounts.get(key) ?? {
        key,
        sourceCompanyId: parent.companyId,
        sourceCompanyName: parent.companyName,
        targetCompanyId: node.companyId,
        targetCompanyName: node.companyName,
        category: "reports-to",
        label: "Reports-to",
        count: 0,
        kind: "hierarchy" as const,
      };
      current.count += 1;
      edgeCounts.set(key, current);
    }

    node.reports.forEach((child) => visit(child, node));
  }

  roots.forEach((root) => visit(root, null));
  return Array.from(edgeCounts.values()).sort((left, right) =>
    (left.sourceCompanyName ?? "").localeCompare(right.sourceCompanyName ?? "") ||
    (left.targetCompanyName ?? "").localeCompare(right.targetCompanyName ?? "") ||
    left.key.localeCompare(right.key),
  );
}

function collectCompanyRelationshipEdges(links: EnterpriseGraphLink[]): CompanyWireEdge[] {
  const edgeCounts = new Map<string, CompanyWireEdge>();

  for (const link of links) {
    if (!link.sourceCompanyId || !link.targetCompanyId) continue;
    if (link.sourceCompanyId === link.targetCompanyId) continue;

    const key = `${link.sourceCompanyId}:${link.targetCompanyId}:${link.category}`;
    const current = edgeCounts.get(key) ?? {
      key,
      sourceCompanyId: link.sourceCompanyId,
      sourceCompanyName: link.sourceCompanyName,
      targetCompanyId: link.targetCompanyId,
      targetCompanyName: link.targetCompanyName,
      category: link.category,
      label: formatLabel(link.category),
      count: 0,
      kind: "relationship" as const,
    };
    current.count += 1;
    edgeCounts.set(key, current);
  }

  return Array.from(edgeCounts.values()).sort((left, right) =>
    left.category.localeCompare(right.category)
    || (left.sourceCompanyName ?? "").localeCompare(right.sourceCompanyName ?? "")
    || (left.targetCompanyName ?? "").localeCompare(right.targetCompanyName ?? "")
    || left.key.localeCompare(right.key),
  );
}

function buildCompanyHierarchyLevels(
  companies: Company[],
  hierarchyEdges: CompanyWireEdge[],
): Map<string, number> {
  const companyIds = new Set(companies.map((company) => company.id));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const edge of hierarchyEdges) {
    if (!companyIds.has(edge.sourceCompanyId) || !companyIds.has(edge.targetCompanyId)) continue;
    incoming.set(edge.targetCompanyId, (incoming.get(edge.targetCompanyId) ?? 0) + edge.count);
    const children = outgoing.get(edge.sourceCompanyId) ?? [];
    if (!children.includes(edge.targetCompanyId)) children.push(edge.targetCompanyId);
    outgoing.set(edge.sourceCompanyId, children);
  }

  const levels = new Map<string, number>();
  const queue: Array<{ id: string; level: number }> = companies
    .filter((company) => !incoming.has(company.id))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((company) => ({ id: company.id, level: 0 }));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const existing = levels.get(current.id);
    if (existing !== undefined && existing >= current.level) continue;
    levels.set(current.id, current.level);

    for (const childId of outgoing.get(current.id) ?? []) {
      queue.push({ id: childId, level: current.level + 1 });
    }
  }

  for (const company of companies) {
    if (!levels.has(company.id)) levels.set(company.id, 0);
  }

  return levels;
}

function buildGraphLayout(
  blueprints: CompanyBlueprint[],
  links: CompanyWireEdge[],
  minimumWidth = 1280,
): CompanyGraphLayout {
  const levels = Array.from(new Set(blueprints.map((blueprint) => blueprint.hierarchyLevel))).sort((left, right) => left - right);
  const maxRowSize = levels.reduce((max, level) => {
    const count = blueprints.filter((blueprint) => blueprint.hierarchyLevel === level).length;
    return Math.max(max, count);
  }, 1);
  const columns = Math.min(Math.max(maxRowSize, 3), 6);
  const graphWidth = Math.max(
    minimumWidth,
    columns * GRAPH_NODE_WIDTH
      + Math.max(columns - 1, 0) * GRAPH_COLUMN_GAP
      + GRAPH_MARGIN_X * 2,
  );
  const nodes: CompanyGraphNode[] = [];
  let cursorY = 104;

  function addRow(rowBlueprints: CompanyBlueprint[], y: number, columnLimit = rowBlueprints.length) {
    if (rowBlueprints.length === 0) return;

    rowBlueprints.forEach((blueprint, index) => {
      const rowIndex = Math.floor(index / columnLimit);
      const columnIndex = index % columnLimit;
      const columnsInThisRow = Math.min(columnLimit, rowBlueprints.length - rowIndex * columnLimit);
      const currentRowWidth = columnsInThisRow * GRAPH_NODE_WIDTH
        + Math.max(columnsInThisRow - 1, 0) * GRAPH_COLUMN_GAP;
      const currentStartX = Math.max(GRAPH_MARGIN_X, (graphWidth - currentRowWidth) / 2);

      nodes.push({
        blueprint,
        x: currentStartX + columnIndex * (GRAPH_NODE_WIDTH + GRAPH_COLUMN_GAP),
        y: y + rowIndex * GRAPH_ROW_GAP,
        width: GRAPH_NODE_WIDTH,
        height: GRAPH_NODE_HEIGHT,
      });
    });
  }

  for (const level of levels) {
    const rowBlueprints = blueprints
      .filter((blueprint) => blueprint.hierarchyLevel === level)
      .sort((left, right) => left.company.name.localeCompare(right.company.name));
    addRow(rowBlueprints, cursorY, columns);
    const rowCount = Math.max(1, Math.ceil(rowBlueprints.length / columns));
    cursorY += rowCount * GRAPH_ROW_GAP;
  }

  const nodeByCompanyId = new Map(nodes.map((node) => [node.blueprint.company.id, node]));
  const edgeCounts = new Map<string, {
    sourceId: string;
    targetId: string;
    category: string;
    label: string;
    count: number;
    kind: CompanyWireKind;
  }>();

  for (const link of links) {
    if (!link.sourceCompanyId || !link.targetCompanyId) continue;
    if (link.sourceCompanyId === link.targetCompanyId) continue;
    if (!nodeByCompanyId.has(link.sourceCompanyId) || !nodeByCompanyId.has(link.targetCompanyId)) continue;

    const key = `${link.sourceCompanyId}:${link.targetCompanyId}:${link.category}`;
    const current = edgeCounts.get(key) ?? {
      sourceId: link.sourceCompanyId,
      targetId: link.targetCompanyId,
      category: link.category,
      label: link.label,
      count: 0,
      kind: link.kind,
    };
    current.count += link.count;
    edgeCounts.set(key, current);
  }

  const edges: CompanyGraphEdge[] = [...edgeCounts.entries()]
    .map(([key, edge]) => {
      const source = nodeByCompanyId.get(edge.sourceId);
      const target = nodeByCompanyId.get(edge.targetId);
      if (!source || !target) return null;
      return { key, source, target, category: edge.category, label: edge.label, count: edge.count, kind: edge.kind };
    })
    .filter((edge): edge is CompanyGraphEdge => edge !== null);

  const graphHeight = Math.max(
    620,
    cursorY + GRAPH_NODE_HEIGHT,
  );

  return {
    width: graphWidth,
    height: graphHeight,
    nodes,
    edges,
  };
}

function edgePath(edge: CompanyGraphEdge): string {
  const sourceX = edge.source.x + edge.source.width / 2;
  const targetX = edge.target.x + edge.target.width / 2;
  const sourceY = edge.source.y < edge.target.y
    ? edge.source.y + edge.source.height
    : edge.source.y + edge.source.height / 2;
  const targetY = edge.source.y < edge.target.y
    ? edge.target.y
    : edge.target.y + edge.target.height / 2;
  const controlOffset = Math.max(90, Math.abs(targetY - sourceY) * 0.45);

  return `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + controlOffset}, ${targetX} ${targetY - controlOffset}, ${targetX} ${targetY}`;
}

function edgeLabelPosition(edge: CompanyGraphEdge): { x: number; y: number } {
  return {
    x: (edge.source.x + edge.source.width / 2 + edge.target.x + edge.target.width / 2) / 2,
    y: (edge.source.y + edge.source.height + edge.target.y) / 2,
  };
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/35 px-2 py-2 text-center">
      <div className="text-base font-semibold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
    </div>
  );
}

function StructureStat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/12 p-4 text-white shadow-sm backdrop-blur">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-white/70">{detail}</div>
    </div>
  );
}

function CompanyVisionCard({ blueprint }: { blueprint: CompanyBlueprint }) {
  const accent = blueprint.company.brandColor ?? "#2563eb";
  const hierarchyLinks = blueprint.hierarchyIncoming.reduce((total, edge) => total + edge.count, 0)
    + blueprint.hierarchyOutgoing.reduce((total, edge) => total + edge.count, 0);
  const enterpriseLinks = blueprint.relationshipIncoming.reduce((total, edge) => total + edge.count, 0)
    + blueprint.relationshipOutgoing.reduce((total, edge) => total + edge.count, 0);
  const totalRelationships = hierarchyLinks + enterpriseLinks;

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border/70 bg-background/88 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg">
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: accent }}
      />
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
          style={{ background: accent }}
        >
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{blueprint.company.name}</h3>
            <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {blueprint.company.issuePrefix}
            </span>
          </div>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
            {companyDescription(blueprint.company)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MetricPill label="Agents" value={blueprint.agents.length} />
        <MetricPill label="Hierarchy" value={hierarchyLinks} />
        <MetricPill label="Enterprise" value={enterpriseLinks} />
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Mandate signals
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(blueprint.services.length > 0 ? blueprint.services : [hierarchyTierLabel(blueprint.hierarchyLevel)]).map((service) => (
            <span
              key={service}
              className="rounded-full border border-border bg-muted/50 px-2 py-1 text-[11px] text-foreground/80"
            >
              {service}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
        <span>{hierarchyTierLabel(blueprint.hierarchyLevel)}</span>
        <span>{totalRelationships} total links</span>
      </div>
    </article>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 md:max-w-[16rem]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-xl border border-white/12 bg-slate-950/88 px-3 text-sm font-medium normal-case tracking-normal text-slate-100 outline-none transition focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/20"
      >
        {children}
      </select>
    </label>
  );
}

function CompanyGraphCanvas({
  layout,
  isLoading,
}: {
  layout: CompanyGraphLayout;
  isLoading: boolean;
}) {
  return (
    <div className="relative min-h-[620px] flex-1 overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_82%_20%,rgba(16,185,129,0.13),transparent_32%),linear-gradient(135deg,#020617,#0f172a_48%,#020617)]" />
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Full corporation structure graph"
        className="absolute inset-0 z-10 block h-full w-full"
      >
        <defs>
          <pattern id="full-structure-grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke="rgba(148,163,184,0.10)" strokeWidth="1" />
          </pattern>
          <marker
            id="full-structure-arrow"
            markerWidth="11"
            markerHeight="11"
            refX="9"
            refY="5.5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 5.5 L 0 11 z" fill="rgba(103,232,249,0.78)" />
          </marker>
        </defs>
        <rect width={layout.width} height={layout.height} fill="url(#full-structure-grid)" />

        {layout.edges.map((edge) => {
          const labelPosition = edgeLabelPosition(edge);
          return (
            <g key={edge.key}>
              <path
                d={edgePath(edge)}
                fill="none"
                stroke={edge.kind === "hierarchy" ? "rgba(56,189,248,0.84)" : "rgba(52,211,153,0.74)"}
                strokeWidth={Math.min(4, 1.8 + edge.count * 0.35)}
                strokeDasharray={edge.kind === "relationship" ? "8 7" : undefined}
                markerEnd="url(#full-structure-arrow)"
              />
              <g transform={`translate(${labelPosition.x} ${labelPosition.y})`}>
                <rect
                  x="-48"
                  y="-14"
                  width="96"
                  height="28"
                  rx="14"
                  fill="rgba(15,23,42,0.88)"
                  stroke="rgba(148,163,184,0.28)"
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(226,232,240,0.92)"
                  fontSize="11"
                  fontWeight="700"
                  letterSpacing="0.04em"
                >
                  {edge.label} {edge.count > 1 ? edge.count : ""}
                </text>
              </g>
            </g>
          );
        })}

        {layout.nodes.map((node) => {
          const accent = node.blueprint.company.brandColor ?? "#22d3ee";
          const labelLines = splitLabel(node.blueprint.company.name);
          const relationshipCount =
            node.blueprint.hierarchyIncoming.reduce((total, edge) => total + edge.count, 0)
            + node.blueprint.hierarchyOutgoing.reduce((total, edge) => total + edge.count, 0)
            + node.blueprint.relationshipIncoming.reduce((total, edge) => total + edge.count, 0)
            + node.blueprint.relationshipOutgoing.reduce((total, edge) => total + edge.count, 0);
          const tierLabel = hierarchyTierLabel(node.blueprint.hierarchyLevel);

          return (
            <g key={node.blueprint.company.id} transform={`translate(${node.x} ${node.y})`}>
              <rect
                width={node.width}
                height={node.height}
                rx="24"
                fill="rgba(15,23,42,0.93)"
                stroke={accent}
                strokeOpacity="0.86"
                strokeWidth="1.5"
              />
              <rect
                x="1"
                y="1"
                width={node.width - 2}
                height="34"
                rx="23"
                fill={accent}
                opacity="0.18"
              />
              <circle cx="28" cy="28" r="12" fill={accent} />
              <text x="50" y="31" fill="rgba(226,232,240,0.96)" fontSize="12" fontWeight="800" letterSpacing="0.16em">
                {node.blueprint.company.issuePrefix}
              </text>
              <text x={node.width - 18} y="31" textAnchor="end" fill="rgba(203,213,225,0.78)" fontSize="10" fontWeight="700">
                {tierLabel}
              </text>
              {labelLines.map((line, index) => (
                <text
                  key={line}
                  x="22"
                  y={60 + index * 16}
                  fill="rgba(248,250,252,0.96)"
                  fontSize="14"
                  fontWeight="750"
                >
                  {line}
                </text>
              ))}
              <text x="22" y="103" fill="rgba(148,163,184,0.94)" fontSize="11" fontWeight="600">
                {node.blueprint.agents.length} agents / {relationshipCount} links
              </text>
            </g>
          );
        })}

        {!isLoading && layout.nodes.length === 0 ? (
          <g transform={`translate(${layout.width / 2} ${layout.height / 2})`}>
            <rect x="-180" y="-42" width="360" height="84" rx="22" fill="rgba(15,23,42,0.9)" stroke="rgba(148,163,184,0.28)" />
            <text textAnchor="middle" y="-6" fill="rgba(248,250,252,0.95)" fontSize="15" fontWeight="800">
              No organizations match these filters
            </text>
            <text textAnchor="middle" y="20" fill="rgba(148,163,184,0.9)" fontSize="12">
              Reset filters to restore the full corporation map.
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

export function FullStructurePage() {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const { companies, loading, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [companyFilter, setCompanyFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [relationshipFilter, setRelationshipFilter] = useState("all");
  const [searchValue, setSearchValue] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => {
    if (typeof window === "undefined") return 1280;
    return window.innerWidth;
  });
  const deferredSearchValue = useDeferredValue(searchValue);
  const searchTerm = deferredSearchValue.trim().toLowerCase();

  const activeCompanies = useMemo(
    () => companies.filter((company) => company.status !== "archived"),
    [companies],
  );

  const routeCompany = useMemo(() => {
    if (!companyPrefix) return null;
    const normalizedPrefix = companyPrefix.toUpperCase();
    return activeCompanies.find((company) => company.issuePrefix.toUpperCase() === normalizedPrefix) ?? null;
  }, [activeCompanies, companyPrefix]);

  const graphSeedCompany = routeCompany ?? selectedCompany ?? activeCompanies[0] ?? null;

  const enterpriseGraphQuery = useQuery({
    queryKey: graphSeedCompany
      ? queryKeys.enterpriseGraph(graphSeedCompany.id, CROSS_COMPANY_GRAPH_SCOPE)
      : ["enterprise-graph", "full-structure", "none"],
    queryFn: () => agentsApi.enterpriseGraph(graphSeedCompany!.id, CROSS_COMPANY_GRAPH_SCOPE),
    enabled: !!graphSeedCompany,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Full Structure" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === pageRef.current);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  const graphNodes = enterpriseGraphQuery.data?.nodes ?? [];
  const graphLinks = enterpriseGraphQuery.data?.links ?? [];
  const graphRoots = enterpriseGraphQuery.data?.roots ?? [];
  const workflowPacks = enterpriseGraphQuery.data?.workflowPacks ?? [];
  const hierarchyCompanyEdges = useMemo(
    () => collectCompanyHierarchyEdges(graphRoots),
    [graphRoots],
  );
  const relationshipCompanyEdges = useMemo(
    () => collectCompanyRelationshipEdges(graphLinks),
    [graphLinks],
  );
  const companyWireEdges = useMemo(
    () => [...hierarchyCompanyEdges, ...relationshipCompanyEdges],
    [hierarchyCompanyEdges, relationshipCompanyEdges],
  );
  const hierarchyLevels = useMemo(
    () => buildCompanyHierarchyLevels(activeCompanies, hierarchyCompanyEdges),
    [activeCompanies, hierarchyCompanyEdges],
  );
  const relationshipCategories = useMemo(() => relationshipSummary(companyWireEdges), [companyWireEdges]);

  const blueprints = useMemo(() => {
    return activeCompanies
      .map((company): CompanyBlueprint => {
        const agents = graphNodes.filter((agent) => agent.companyId === company.id);
        return {
          company,
          hierarchyLevel: hierarchyLevels.get(company.id) ?? 0,
          agents,
          hierarchyIncoming: hierarchyCompanyEdges.filter((link) => link.targetCompanyId === company.id),
          hierarchyOutgoing: hierarchyCompanyEdges.filter((link) => link.sourceCompanyId === company.id),
          relationshipIncoming: relationshipCompanyEdges.filter((link) => link.targetCompanyId === company.id),
          relationshipOutgoing: relationshipCompanyEdges.filter((link) => link.sourceCompanyId === company.id),
          services: deriveServices(agents),
        };
      })
      .sort(blueprintSort);
  }, [activeCompanies, graphNodes, hierarchyCompanyEdges, hierarchyLevels, relationshipCompanyEdges]);

  const filteredBlueprints = useMemo(() => {
    return blueprints.filter((blueprint) => {
      if (companyFilter !== "all" && blueprint.company.id !== companyFilter) return false;
      if (tierFilter !== "all" && blueprint.hierarchyLevel !== Number(tierFilter)) return false;
      if (!matchesBlueprintSearch(blueprint, searchTerm)) return false;
      if (relationshipFilter !== "all" && !hasRelationshipCategory(blueprint, relationshipFilter)) return false;
      return true;
    });
  }, [blueprints, companyFilter, relationshipFilter, searchTerm, tierFilter]);

  const visibleCompanyIds = useMemo(
    () => new Set(filteredBlueprints.map((blueprint) => blueprint.company.id)),
    [filteredBlueprints],
  );

  const visibleGraphLinks = useMemo(() => {
    return companyWireEdges.filter((link) => {
      if (!visibleCompanyIds.has(link.sourceCompanyId) || !visibleCompanyIds.has(link.targetCompanyId)) return false;
      return relationshipFilter === "all" || link.category === relationshipFilter;
    });
  }, [companyWireEdges, relationshipFilter, visibleCompanyIds]);

  const graphLayout = useMemo(
    () => buildGraphLayout(
      filteredBlueprints,
      visibleGraphLinks,
      Math.max(1280, viewportWidth - (isFullscreen ? 0 : 40)),
    ),
    [filteredBlueprints, isFullscreen, viewportWidth, visibleGraphLinks],
  );

  const availableTiers = useMemo(
    () => Array.from(new Set(blueprints.map((blueprint) => blueprint.hierarchyLevel))).sort((left, right) => left - right),
    [blueprints],
  );

  const blueprintsByTier = useMemo(() => {
    return availableTiers.map((tier) => ({
      tier,
      blueprints: filteredBlueprints.filter((blueprint) => blueprint.hierarchyLevel === tier),
    }));
  }, [availableTiers, filteredBlueprints]);

  const activeFilterCount = [
    companyFilter !== "all",
    tierFilter !== "all",
    relationshipFilter !== "all",
    searchValue.trim().length > 0,
  ].filter(Boolean).length;
  const totalHierarchyLinks = hierarchyCompanyEdges.reduce((total, edge) => total + edge.count, 0);
  const totalRelationshipLinks = relationshipCompanyEdges.reduce((total, edge) => total + edge.count, 0);
  const totalVisibleLinks = visibleGraphLinks.reduce((total, edge) => total + edge.count, 0);
  const seedLabel = graphSeedCompany
    ? `${graphSeedCompany.issuePrefix} / ${graphSeedCompany.name}`
    : "No route seed";

  const backTo =
    typeof (location.state as { backTo?: string } | null)?.backTo === "string"
      ? (location.state as { backTo?: string }).backTo!
      : "/dashboard";

  function resetFilters() {
    setCompanyFilter("all");
    setTierFilter("all");
    setRelationshipFilter("all");
    setSearchValue("");
  }

  async function toggleFullscreen() {
    const element = pageRef.current;
    if (!element) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (element.requestFullscreen) {
        await element.requestFullscreen();
        return;
      }
    } catch {
      // Fall back to fixed-position full-screen styling below.
    }

    setIsFullscreen((current) => !current);
  }

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Loading corporation structure...
      </div>
    );
  }

  return (
    <div
      ref={pageRef}
      className={cn(
        "h-dvh overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.20),transparent_30%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted))_45%,hsl(var(--background)))] text-foreground",
        isFullscreen && "fixed inset-0 z-[200] bg-background",
      )}
    >
      <div className={cn("flex min-h-full flex-col gap-4 p-3 md:p-5", isFullscreen && "gap-2 p-0")}>
        {!isFullscreen ? (
          <header className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-slate-950 p-5 text-white shadow-2xl md:p-7">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-emerald-300/14 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <Button asChild variant="outline" size="sm" className="mb-5 border-white/20 bg-white/10 text-white hover:bg-white/18 hover:text-white">
                  <Link to={backTo}>
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Link>
                </Button>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Standalone multi-company feature
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                  Full Corporation Structure
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72 md:text-base">
                  A browser-wide live graph for the whole corporation, seeded from the active
                  company route and drawn from real reports-to hierarchy plus inter-company links.
                </p>
                <p className="mt-3 text-xs text-white/54">
                  Route seed: {seedLabel}. Auto-refreshes every 15 seconds.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:w-[34rem]">
                <StructureStat icon={Building2} label="Organizations" value={activeCompanies.length} detail="entities inside the feature" />
                <StructureStat icon={Users} label="Agents" value={graphNodes.length} detail="visible workforce nodes" />
                <StructureStat icon={Network} label="Wiring" value={totalHierarchyLinks + totalRelationshipLinks} detail={`${totalHierarchyLinks} hierarchy / ${totalRelationshipLinks} enterprise`} />
              </div>
            </div>
          </header>
        ) : null}

        <section className={cn(
          "flex min-h-[calc(100dvh-2rem)] flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-slate-700/55 bg-slate-950 shadow-2xl",
          !isFullscreen && "min-h-[calc(100dvh-12rem)]",
          isFullscreen && "min-h-dvh rounded-none border-0",
        )}>
          <div className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/96 p-3 text-white shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-slate-950/88 md:p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
              <div className="flex min-w-[16rem] flex-1 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/15 text-cyan-200 ring-1 ring-cyan-200/20">
                  <Workflow className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/75">
                    <span>Live Full Structure</span>
                    <span className="rounded-full bg-emerald-400/14 px-2 py-0.5 text-emerald-200">
                      {enterpriseGraphQuery.isFetching ? "Syncing" : "Live"}
                    </span>
                  </div>
                  <h2 className="truncate text-lg font-semibold tracking-tight text-white md:text-xl">
                    Route-seeded corporation graph
                  </h2>
                </div>
              </div>

              <div className="grid flex-[2] gap-2 md:grid-cols-2 xl:grid-cols-[1fr_0.8fr_0.9fr_1.2fr_auto_auto_auto] xl:items-end">
                <FilterSelect label="Organization" value={companyFilter} onChange={setCompanyFilter}>
                  <option value="all">All organizations</option>
                  {activeCompanies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </FilterSelect>

                <FilterSelect label="Tier" value={tierFilter} onChange={setTierFilter}>
                  <option value="all">All hierarchy tiers</option>
                  {availableTiers.map((tier) => (
                    <option key={tier} value={String(tier)}>
                      {hierarchyTierLabel(tier)}
                    </option>
                  ))}
                </FilterSelect>

                <FilterSelect label="Relationship" value={relationshipFilter} onChange={setRelationshipFilter}>
                  <option value="all">All relationships</option>
                  {relationshipCategories.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label}
                    </option>
                  ))}
                </FilterSelect>

                <label className="flex min-w-[13rem] flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Search
                  <span className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                      placeholder="Find company or service"
                      className="h-10 w-full rounded-xl border border-white/12 bg-slate-950/88 pl-9 pr-3 text-sm font-medium normal-case tracking-normal text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/20"
                    />
                  </span>
                </label>

                <Button
                  type="button"
                  variant="outline"
                  className="h-10 border-white/12 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  onClick={() => enterpriseGraphQuery.refetch()}
                >
                  <RefreshCw className={cn("h-4 w-4", enterpriseGraphQuery.isFetching && "animate-spin")} />
                  Refresh
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-10 border-white/12 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  onClick={resetFilters}
                  disabled={activeFilterCount === 0}
                >
                  {activeFilterCount > 0 ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
                  Reset
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-10 border-cyan-200/25 bg-cyan-300/10 text-cyan-50 hover:bg-cyan-300/18 hover:text-white"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  {isFullscreen ? "Exit" : "Full screen"}
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Showing {filteredBlueprints.length} of {activeCompanies.length} organizations
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {totalVisibleLinks} visible hierarchy and enterprise links
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                Seeded by {seedLabel}
              </span>
            </div>
          </div>

          {enterpriseGraphQuery.isError ? (
            <div className="border-b border-amber-300/30 bg-amber-400/12 px-4 py-3 text-sm text-amber-100">
              The enterprise relationship API did not load, so this page is showing company-level
              structure without agent wiring.
            </div>
          ) : null}

          <div className={cn("flex min-h-[580px] flex-1 flex-col", isFullscreen && "min-h-0")}>
            <CompanyGraphCanvas layout={graphLayout} isLoading={enterpriseGraphQuery.isLoading} />
          </div>
        </section>

        {!isFullscreen ? (
          <section className="grid gap-4 xl:grid-cols-[1.5fr_0.5fr]">
            <div className="rounded-[1.75rem] border border-border/70 bg-background/92 p-4 shadow-xl md:p-5">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Company detail cards
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                    Filtered organizations inside the standalone feature
                  </h2>
                </div>
                <div className="rounded-full border border-border bg-muted/45 px-3 py-1 text-xs text-muted-foreground">
                  {enterpriseGraphQuery.isLoading ? "Loading enterprise wiring..." : "Live from board data"}
                </div>
              </div>

              <div className="space-y-4">
                {blueprintsByTier.map(({ tier, blueprints: tierBlueprints }) => {
                  return (
                    <div
                      key={tier}
                      className="relative rounded-[1.5rem] border border-border/70 bg-muted/24 p-4"
                    >
                      <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            <GitBranch className="h-3.5 w-3.5" />
                            {hierarchyTierLabel(tier)}
                          </div>
                          <h3 className="mt-1 text-base font-semibold text-foreground">
                            Route-derived hierarchy tier
                          </h3>
                        </div>
                        <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                          {hierarchyTierDescription(tier)}
                        </p>
                      </div>

                      {tierBlueprints.length > 0 ? (
                        <div className={cn(
                          "grid gap-3",
                          "md:grid-cols-2 2xl:grid-cols-3",
                        )}>
                          {tierBlueprints.map((blueprint) => (
                            <CompanyVisionCard key={blueprint.company.id} blueprint={blueprint} />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                          No companies in this hierarchy tier match the current filters.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <aside className="flex flex-col gap-4">
              <section className="rounded-[1.75rem] border border-border/70 bg-background/92 p-5 shadow-xl">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold text-foreground">Enterprise rhythm</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  These packs describe how work should move across the corporation without turning
                  this page into a native org chart.
                </p>
                <div className="mt-4 space-y-3">
                  {workflowPacks.slice(0, 4).map((pack) => (
                    <div key={pack.key} className="rounded-2xl border border-border/70 bg-muted/28 p-3">
                      <div className="text-sm font-semibold text-foreground">{pack.label}</div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{pack.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {pack.stageLabels.map((stage) => (
                          <span key={stage} className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {stage}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {workflowPacks.length === 0 && !enterpriseGraphQuery.isLoading ? (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/24 p-3 text-sm text-muted-foreground">
                      No enterprise workflow packs are configured yet.
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-border/70 bg-background/92 p-5 shadow-xl">
                <div className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold text-foreground">Relationship mix</h2>
                </div>
                <div className="mt-4 space-y-2">
                  {relationshipCategories.length > 0 ? relationshipCategories.map((category) => (
                    <button
                      key={category.key}
                      type="button"
                      onClick={() => setRelationshipFilter(category.key)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition",
                        relationshipFilter === category.key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/70 bg-muted/24 text-foreground hover:bg-muted/45",
                      )}
                    >
                      <span className="text-sm">{category.label}</span>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {category.count}
                      </span>
                    </button>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/24 p-3 text-sm text-muted-foreground">
                      No cross-company relationship categories are visible yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-border/70 bg-background/92 p-5 shadow-xl">
                <h2 className="text-base font-semibold text-foreground">Boundary note</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Use this page for the global full-structure feature. Use native org pages only
                  when you need a company-specific hierarchy chart.
                </p>
              </section>
            </aside>
          </section>
        ) : null}
      </div>
    </div>
  );
}
