// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BUILTIN_ENTERPRISE_WORKFLOW_PACKS,
  resolveEnterpriseRelationshipTypes,
  type EnterpriseGraphNode,
  type EnterpriseGraphOrgNode,
  type EnterpriseGraphView,
} from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FullStructureEnterpriseOrgChart } from "./FullStructureEnterpriseOrgChart";

const mockAgentsApi = vi.hoisted(() => ({
  org: vi.fn(),
  enterpriseGraph: vi.fn(),
  listGlobal: vi.fn(),
  list: vi.fn(),
}));
const mockNavigate = vi.hoisted(() => vi.fn());
const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());

vi.mock("../api/agents", () => ({
  agentsApi: mockAgentsApi,
}));

vi.mock("@/lib/router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => mockNavigate,
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: mockSetBreadcrumbs }),
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    companies: [
      {
        id: "fam",
        name: "Family Trust",
        issuePrefix: "FAM",
        status: "active",
        brandColor: "#0f766e",
        logoUrl: null,
      },
      {
        id: "cor",
        name: "COR - Cornerstone Capital Holding LLC",
        issuePrefix: "COR",
        status: "active",
        brandColor: "#f59e0b",
        logoUrl: null,
      },
      {
        id: "ebu",
        name: "EBU - E-Business Expert LLC",
        issuePrefix: "EBU",
        status: "active",
        brandColor: "#db2777",
        logoUrl: null,
      },
    ],
    selectedCompanyId: "fam",
    selectedCompany: {
      id: "fam",
      name: "Family Trust",
      issuePrefix: "FAM",
      status: "active",
      brandColor: "#0f766e",
      logoUrl: null,
    },
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function graphAgent(
  id: string,
  companyId: string,
  companyName: string,
  name: string,
  reportsTo: string | null,
): EnterpriseGraphNode {
  return {
    id,
    companyId,
    companyName,
    externalToCompany: companyId !== "fam",
    name,
    urlKey: id,
    role: "ceo",
    title: name,
    icon: null,
    status: "active",
    reportsTo,
    capabilities: `${name} capabilities`,
    adapterType: "claude_local",
    adapterConfig: {},
    runtimeConfig: {},
    defaultEnvironmentId: null,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: {
      canCreateAgents: true,
      canManageRelationshipTypes: true,
      canManageServiceDiscovery: true,
    },
    lastHeartbeatAt: null,
    metadata: {
      department: companyName,
    },
    secondaryLinkCount: 0,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
  };
}

function orgNode(
  id: string,
  companyId: string,
  companyName: string,
  name: string,
  reports: EnterpriseGraphOrgNode[] = [],
): EnterpriseGraphOrgNode {
  return {
    id,
    companyId,
    companyName,
    externalToCompany: companyId !== "fam",
    name,
    role: "ceo",
    status: "active",
    reports,
  };
}

function buildEnterpriseGraph(): EnterpriseGraphView {
  const trustManager = graphAgent("trust-manager", "fam", "Family Trust", "Family Trust Manager", null);
  const owner = graphAgent("oussama", "fam", "Family Trust", "Oussama Ben Rhouma Trust Steward", "trust-manager");
  const cornerstone = graphAgent(
    "cornerstone-president",
    "cor",
    "COR - Cornerstone Capital Holding LLC",
    "Cornerstone President",
    "oussama",
  );
  const ebu = graphAgent(
    "ebu-director",
    "ebu",
    "EBU - E-Business Expert LLC",
    "E-Business Expert Director",
    "cornerstone-president",
  );
  const msg = graphAgent("msg-director", "cor", "COR - Cornerstone Capital Holding LLC", "MSG Director", null);

  return {
    companyId: "fam",
    roots: [
      orgNode("trust-manager", "fam", "Family Trust", "Family Trust Manager", [
        orgNode("oussama", "fam", "Family Trust", "Oussama Ben Rhouma Trust Steward", [
          orgNode("cornerstone-president", "cor", "COR - Cornerstone Capital Holding LLC", "Cornerstone President", [
            orgNode("ebu-director", "ebu", "EBU - E-Business Expert LLC", "E-Business Expert Director"),
          ]),
        ]),
      ]),
      orgNode("msg-director", "cor", "COR - Cornerstone Capital Holding LLC", "MSG Director"),
    ],
    nodes: [trustManager, owner, cornerstone, ebu, msg],
    links: [
      {
        id: "owner-pay",
        sourceAgentId: "oussama",
        sourceAgentName: "Oussama Ben Rhouma Trust Steward",
        sourceCompanyId: "fam",
        sourceCompanyName: "Family Trust",
        targetAgentId: "cornerstone-president",
        targetAgentName: "Cornerstone President",
        targetCompanyId: "cor",
        targetCompanyName: "COR - Cornerstone Capital Holding LLC",
        typeKey: "budgetFundedBy",
        typeLabel: "Budget funded by",
        typeDescription: "Owner pay funding lane",
        category: "finance",
        builtIn: true,
        notes: "Owner-pay lane comes from COR.",
      },
    ],
    availableTypes: resolveEnterpriseRelationshipTypes(),
    workflowPacks: BUILTIN_ENTERPRISE_WORKFLOW_PACKS,
  };
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("FullStructureEnterpriseOrgChart preserved enterprise full-org UI", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockAgentsApi.org.mockResolvedValue(buildEnterpriseGraph().roots);
    mockAgentsApi.enterpriseGraph.mockResolvedValue(buildEnterpriseGraph());
    mockAgentsApi.listGlobal.mockResolvedValue(buildEnterpriseGraph().nodes);
    mockAgentsApi.list.mockResolvedValue([]);
    window.localStorage.clear();
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  async function renderChart() {
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <FullStructureEnterpriseOrgChart
            fullscreen
            initialViewMode="enterprise"
            lockViewMode="enterprise"
            startExpanded
            defaultInspectorMinimized
            compactFilters
            enterpriseScope="family"
            title="Full Structure"
          />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    return root;
  }

  it("keeps compact top filters, color key, wheel zoom, per-node collapse, and reset behavior", async () => {
    const root = await renderChart();

    expect(container.querySelector("[data-full-structure-topbar]")).toBeTruthy();
    expect(container.querySelector("[data-full-structure-filters]")).toBeTruthy();
    expect(container.querySelector("[data-full-structure-color-key]")).toBeTruthy();
    expect(container.textContent).toContain("COR - Cornerstone Capital Holding LLC");
    expect(container.textContent).toContain("Budget funded by");

    const graphPanel = container.querySelector<HTMLElement>("[data-graph-shortcut='wheel-zoom']");
    expect(graphPanel).toBeTruthy();
    const zoomBefore = Number.parseFloat(graphPanel?.dataset.graphZoom ?? "0");
    await act(async () => {
      graphPanel?.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 160,
          clientY: 160,
          deltaY: -120,
        }),
      );
    });
    const zoomAfter = Number.parseFloat(graphPanel?.dataset.graphZoom ?? "0");
    expect(zoomAfter).toBeGreaterThan(zoomBefore);

    const visibleCardsBeforeCollapse = container.querySelectorAll("[data-org-card]").length;
    const collapseButton = container.querySelector<HTMLButtonElement>("[data-org-collapse][aria-label='Collapse branch']");
    expect(collapseButton).toBeTruthy();

    await act(async () => {
      collapseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(container.querySelector("[data-org-card][data-collapsed='true']")).toBeTruthy();
    expect(container.querySelectorAll("[data-org-card]").length).toBeLessThan(visibleCardsBeforeCollapse);
    expect(container.textContent).toContain("MSG Director");

    const resetButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Reset filters"),
    );
    expect(resetButton).toBeTruthy();

    await act(async () => {
      resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(container.querySelector("[data-org-card][data-collapsed='true']")).toBeNull();
    expect(container.querySelectorAll("[data-org-card]").length).toBe(visibleCardsBeforeCollapse);

    await act(async () => {
      root.unmount();
    });
  }, 15_000);

  it("toggles compact card details for every visible org card", async () => {
    const root = await renderChart();

    expect(
      Array.from(container.querySelectorAll("[data-org-card]")).every(
        (card) => card.getAttribute("data-card-details-expanded") === "false",
      ),
    ).toBe(true);

    const detailsButton = container.querySelector<HTMLButtonElement>("[data-card-details-toggle-all]");
    expect(detailsButton?.textContent).toContain("Show card details");

    await act(async () => {
      detailsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushReact();

    expect(
      Array.from(container.querySelectorAll("[data-org-card]")).every(
        (card) => card.getAttribute("data-card-details-expanded") === "true",
      ),
    ).toBe(true);

    await act(async () => {
      root.unmount();
    });
  }, 15_000);
});
