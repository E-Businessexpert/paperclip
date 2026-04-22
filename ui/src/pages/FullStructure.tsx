import { useEffect, useMemo } from "react";
import type {
  Company,
  EnterpriseGraphLink,
  EnterpriseGraphNode,
} from "@paperclipai/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  GitBranch,
  Network,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { Link, useLocation, useParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { agentsApi } from "../api/agents";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";

type CorporateLayer = "family" | "holding" | "operating";

interface CompanyBlueprint {
  company: Company;
  layer: CorporateLayer;
  agents: EnterpriseGraphNode[];
  incoming: EnterpriseGraphLink[];
  outgoing: EnterpriseGraphLink[];
  services: string[];
}

const layerOrder: CorporateLayer[] = ["family", "holding", "operating"];

const layerCopy: Record<CorporateLayer, {
  eyebrow: string;
  title: string;
  description: string;
}> = {
  family: {
    eyebrow: "Ownership",
    title: "Family vision and control",
    description: "The top-level mandate that defines the enterprise, its continuity, and its long-term capital logic.",
  },
  holding: {
    eyebrow: "Capital",
    title: "Holding and allocation layer",
    description: "The corporate layer that turns the vision into governance, allocation, and operating priorities.",
  },
  operating: {
    eyebrow: "Execution",
    title: "Standalone operating companies",
    description: "Each company keeps its own mission while contributing to the larger corporation blueprint.",
  },
};

function normalizePrefix(prefix: string | null | undefined): string | null {
  return prefix ? prefix.toUpperCase() : null;
}

function classifyCompany(company: Company): CorporateLayer {
  const name = company.name.toLowerCase();
  const prefix = company.issuePrefix.toUpperCase();

  if (name.includes("family trust") || prefix === "FAM") {
    return "family";
  }

  if (name.includes("holding") || name.includes("capital") || name.includes("cornerstone")) {
    return "holding";
  }

  return "operating";
}

function layerSort(left: CompanyBlueprint, right: CompanyBlueprint): number {
  const layerDelta = layerOrder.indexOf(left.layer) - layerOrder.indexOf(right.layer);
  if (layerDelta !== 0) return layerDelta;
  return left.company.name.localeCompare(right.company.name);
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

function relationshipSummary(links: EnterpriseGraphLink[]): Array<{ key: string; label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>();

  for (const link of links) {
    const current = counts.get(link.category) ?? { label: formatLabel(link.category), count: 0 };
    current.count += 1;
    counts.set(link.category, current);
  }

  return [...counts.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 6);
}

function companyDescription(company: Company, layer: CorporateLayer): string {
  if (company.description) return company.description;

  if (layer === "family") {
    return "Enterprise-wide owner intent, continuity, and long-range decision architecture.";
  }

  if (layer === "holding") {
    return "Capital, governance, shared systems, and strategic coordination across the family enterprise.";
  }

  return "Focused operating company with its own market role, accountability, and execution surface.";
}

function CompanyVisionCard({ blueprint }: { blueprint: CompanyBlueprint }) {
  const accent = blueprint.company.brandColor ?? "#2563eb";
  const totalRelationships = blueprint.incoming.length + blueprint.outgoing.length;

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
            {companyDescription(blueprint.company, blueprint.layer)}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MetricPill label="Agents" value={blueprint.agents.length} />
        <MetricPill label="Inbound" value={blueprint.incoming.length} />
        <MetricPill label="Outbound" value={blueprint.outgoing.length} />
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Mandate signals
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(blueprint.services.length > 0 ? blueprint.services : [layerCopy[blueprint.layer].eyebrow]).map((service) => (
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
        <span>{layerCopy[blueprint.layer].eyebrow} layer</span>
        <span>{totalRelationships} enterprise links</span>
      </div>
    </article>
  );
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

export function FullStructurePage() {
  const { companyPrefix } = useParams<{ companyPrefix: string }>();
  const location = useLocation();
  const { companies, loading } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const matchedCompany = useMemo(() => {
    const normalizedPrefix = normalizePrefix(companyPrefix);
    if (!normalizedPrefix) return null;
    return companies.find((company) => company.issuePrefix.toUpperCase() === normalizedPrefix) ?? null;
  }, [companies, companyPrefix]);

  const enterpriseRootCompany = useMemo(() => {
    if (matchedCompany && classifyCompany(matchedCompany) !== "operating") {
      return matchedCompany;
    }

    return (
      companies.find((company) => /family trust/i.test(company.name))
      ?? companies.find((company) => /cornerstone|holding/i.test(company.name))
      ?? matchedCompany
      ?? companies[0]
      ?? null
    );
  }, [companies, matchedCompany]);

  const enterpriseGraphQuery = useQuery({
    queryKey: enterpriseRootCompany
      ? queryKeys.enterpriseGraph(enterpriseRootCompany.id, "family")
      : ["enterprise-graph", "full-structure", "none"],
    queryFn: () => agentsApi.enterpriseGraph(enterpriseRootCompany!.id, "family"),
    enabled: !!enterpriseRootCompany,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Full Structure" }]);
  }, [setBreadcrumbs]);

  const activeCompanies = useMemo(
    () => companies.filter((company) => company.status !== "archived"),
    [companies],
  );

  const graphNodes = enterpriseGraphQuery.data?.nodes ?? [];
  const graphLinks = enterpriseGraphQuery.data?.links ?? [];
  const workflowPacks = enterpriseGraphQuery.data?.workflowPacks ?? [];
  const relationshipCategories = useMemo(() => relationshipSummary(graphLinks), [graphLinks]);

  const blueprints = useMemo(() => {
    return activeCompanies
      .map((company): CompanyBlueprint => {
        const agents = graphNodes.filter((agent) => agent.companyId === company.id);
        return {
          company,
          layer: classifyCompany(company),
          agents,
          incoming: graphLinks.filter((link) => link.targetCompanyId === company.id),
          outgoing: graphLinks.filter((link) => link.sourceCompanyId === company.id),
          services: deriveServices(agents),
        };
      })
      .sort(layerSort);
  }, [activeCompanies, graphLinks, graphNodes]);

  const blueprintsByLayer = useMemo(() => {
    const grouped: Record<CorporateLayer, CompanyBlueprint[]> = {
      family: [],
      holding: [],
      operating: [],
    };

    for (const blueprint of blueprints) {
      grouped[blueprint.layer].push(blueprint);
    }

    return grouped;
  }, [blueprints]);

  const backTo =
    typeof (location.state as { backTo?: string } | null)?.backTo === "string"
      ? (location.state as { backTo?: string }).backTo!
      : "/dashboard";

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-sm text-muted-foreground">
        Loading corporation structure...
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.20),transparent_30%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted))_45%,hsl(var(--background)))] p-3 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
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
                Standalone corporation vision
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
                Full Corporation Structure
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72 md:text-base">
                A separate enterprise blueprint for the full family corporation. This is not the
                native Paperclip org chart; it keeps company identity, ownership intent, capital
                control, and operating-company mandates in one standalone view.
              </p>
              <p className="mt-3 text-xs text-white/54">
                Rooted in {enterpriseRootCompany?.name ?? "the selected family company"}.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:w-[34rem]">
              <StructureStat icon={Building2} label="Companies" value={activeCompanies.length} detail="legal and operating entities" />
              <StructureStat icon={Users} label="Agents" value={graphNodes.length} detail="visible workforce nodes" />
              <StructureStat icon={Network} label="Links" value={graphLinks.length} detail="enterprise wiring points" />
            </div>
          </div>
        </header>

        {enterpriseGraphQuery.isError ? (
          <div className="rounded-2xl border border-amber-300/40 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
            The enterprise relationship API did not load, so this page is showing the company-level
            corporation structure without agent wiring.
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-[1.75rem] border border-border/70 bg-background/92 p-4 shadow-xl md:p-5">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Corporation map
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                  Vision, capital, and operating companies
                </h2>
              </div>
              <div className="rounded-full border border-border bg-muted/45 px-3 py-1 text-xs text-muted-foreground">
                {enterpriseGraphQuery.isLoading ? "Loading enterprise wiring..." : "Live from board data"}
              </div>
            </div>

            <div className="space-y-4">
              {layerOrder.map((layer) => {
                const layerBlueprints = blueprintsByLayer[layer];
                return (
                  <div
                    key={layer}
                    className={cn(
                      "relative rounded-[1.5rem] border border-border/70 bg-muted/24 p-4",
                      layer !== "operating" && "after:absolute after:bottom-[-1rem] after:left-1/2 after:h-4 after:w-px after:bg-border",
                    )}
                  >
                    <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          <GitBranch className="h-3.5 w-3.5" />
                          {layerCopy[layer].eyebrow}
                        </div>
                        <h3 className="mt-1 text-base font-semibold text-foreground">{layerCopy[layer].title}</h3>
                      </div>
                      <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                        {layerCopy[layer].description}
                      </p>
                    </div>

                    {layerBlueprints.length > 0 ? (
                      <div className={cn(
                        "grid gap-3",
                        layer === "operating" ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2",
                      )}>
                        {layerBlueprints.map((blueprint) => (
                          <CompanyVisionCard key={blueprint.company.id} blueprint={blueprint} />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border bg-background/70 p-4 text-sm text-muted-foreground">
                        No companies are assigned to this layer yet.
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
                {(workflowPacks.length > 0 ? workflowPacks : []).slice(0, 4).map((pack) => (
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
                  <div key={category.key} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/24 px-3 py-2">
                    <span className="text-sm text-foreground">{category.label}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {category.count}
                    </span>
                  </div>
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
                Use this page for the corporation-level vision. Use the native Paperclip org page
                only when you need the agent hierarchy chart for a specific company.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}
