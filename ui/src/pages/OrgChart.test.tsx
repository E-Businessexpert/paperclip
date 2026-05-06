// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrgChart } from "./OrgChart";

const navigateMock = vi.fn();
const orgMock = vi.fn();
const listMock = vi.fn();
const enterpriseGraphMock = vi.fn();
const companyContextMock = vi.fn();

vi.mock("@/lib/router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => navigateMock,
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => companyContextMock(),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: vi.fn() }),
}));

vi.mock("../api/agents", () => ({
  agentsApi: {
    org: () => orgMock(),
    list: () => listMock(),
    listGlobal: () => listMock(),
    enterpriseGraph: () => enterpriseGraphMock(),
  },
}));

vi.mock("../components/AgentIconPicker", () => ({
  AgentIcon: () => <span data-testid="agent-icon" />,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const orgTree = [
  {
    id: "agent-1",
    name: "CEO",
    role: "ceo",
    status: "active",
    reports: [
      {
        id: "agent-2",
        name: "Engineer",
        role: "engineer",
        status: "active",
        reports: [],
      },
    ],
  },
];

const agents = [
  {
    id: "agent-1",
    companyId: "company-1",
    name: "CEO",
    role: "ceo",
    title: null,
    status: "active",
    reportsTo: null,
    capabilities: null,
    adapterType: "codex_local",
    adapterConfig: {},
    contextMode: "thin",
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    lastHeartbeatAt: null,
    icon: "briefcase",
    metadata: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    urlKey: "ceo",
    pauseReason: null,
    pausedAt: null,
    permissions: null,
  },
  {
    id: "agent-2",
    companyId: "company-1",
    name: "Engineer",
    role: "engineer",
    title: null,
    status: "active",
    reportsTo: "agent-1",
    capabilities: null,
    adapterType: "codex_local",
    adapterConfig: {},
    contextMode: "thin",
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    lastHeartbeatAt: null,
    icon: "code",
    metadata: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    urlKey: "engineer",
    pauseReason: null,
    pausedAt: null,
    permissions: null,
  },
];

const defaultCompanies = [
  {
    id: "company-1",
    parentCompanyId: null,
    name: "Company One",
    issuePrefix: "ONE",
    status: "active",
    brandColor: null,
  },
];

function createCompany(
  id: string,
  name: string,
  issuePrefix: string,
  parentCompanyId: string | null = null,
) {
  return {
    id,
    parentCompanyId,
    name,
    issuePrefix,
    status: "active",
    brandColor: null,
  };
}

function createEnterpriseAgent(
  id: string,
  name: string,
  companyId: string,
  companyName: string,
  reports: unknown[] = [],
) {
  return {
    id,
    companyId,
    companyName,
    name,
    role: "agent",
    title: null,
    status: "active",
    reportsTo: null,
    reports,
    capabilities: null,
    adapterType: "codex_local",
    adapterConfig: {},
    contextMode: "thin",
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    lastHeartbeatAt: null,
    icon: "briefcase",
    metadata: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    urlKey: id,
    pauseReason: null,
    pausedAt: null,
    permissions: null,
    externalToCompany: false,
    secondaryLinkCount: 0,
  };
}

function createTouchEvent(type: string, touches: Array<{ clientX: number; clientY: number }>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: touches,
  });
  Object.defineProperty(event, "changedTouches", {
    value: touches,
  });
  return event;
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function parseLayerTransform(transform: string) {
  const match = transform.match(
    /^translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)$/,
  );
  if (!match) {
    throw new Error(`Unexpected transform: ${transform}`);
  }

  return {
    x: Number(match[1]),
    y: Number(match[2]),
    scale: Number(match[3]),
  };
}

describe("OrgChart mobile gestures", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    orgMock.mockResolvedValue(orgTree);
    listMock.mockResolvedValue(agents);
    enterpriseGraphMock.mockResolvedValue({
      companyId: "company-1",
      roots: orgTree,
      nodes: agents,
      links: [],
      availableTypes: [],
      workflowPacks: [],
    });
    companyContextMock.mockReturnValue({
      companies: defaultCompanies,
      selectedCompanyId: "company-1",
      selectedCompany: defaultCompanies[0],
    });
    window.localStorage.clear();

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return this.getAttribute("data-testid") === "org-chart-viewport" ? 360 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this.getAttribute("data-testid") === "org-chart-viewport" ? 520 : 0;
      },
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getRect(this: HTMLElement) {
      if (this.getAttribute("data-testid") === "org-chart-viewport") {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 360,
          bottom: 520,
          width: 360,
          height: 520,
          toJSON: () => ({}),
        };
      }
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      };
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  async function renderOrgChart() {
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <OrgChart />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();
    return {
      viewport: container.querySelector('[data-testid="org-chart-viewport"]') as HTMLDivElement,
      layer: container.querySelector('[data-testid="org-chart-card-layer"]') as HTMLDivElement,
    };
  }

  it("pans the chart with one-finger touch drag", async () => {
    const { viewport, layer } = await renderOrgChart();
    const initialTransform = parseLayerTransform(layer.style.transform);

    await act(async () => {
      viewport.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      viewport.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 130, clientY: 145 }]));
      viewport.dispatchEvent(createTouchEvent("touchend", []));
    });

    const nextTransform = parseLayerTransform(layer.style.transform);
    expect(nextTransform.x).toBeCloseTo(initialTransform.x + 30);
    expect(nextTransform.y).toBeCloseTo(initialTransform.y + 45);
    expect(nextTransform.scale).toBeCloseTo(initialTransform.scale);
  });

  it("suppresses card navigation after a touch pan", async () => {
    const { viewport } = await renderOrgChart();
    const card = container.querySelector("[data-org-card]") as HTMLDivElement;

    await act(async () => {
      viewport.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      viewport.dispatchEvent(createTouchEvent("touchmove", [{ clientX: 130, clientY: 145 }]));
      viewport.dispatchEvent(createTouchEvent("touchend", []));
      card.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("allows card navigation after a touch tap without movement", async () => {
    const { viewport } = await renderOrgChart();
    const card = container.querySelector("[data-org-card]") as HTMLDivElement;

    await act(async () => {
      viewport.dispatchEvent(createTouchEvent("touchstart", [{ clientX: 100, clientY: 100 }]));
      viewport.dispatchEvent(createTouchEvent("touchend", []));
      card.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(navigateMock).toHaveBeenCalledWith("/agents/ceo");
  });
  it("pinch-zooms toward the touch center", async () => {
    const { viewport, layer } = await renderOrgChart();
    const initialTransform = parseLayerTransform(layer.style.transform);

    await act(async () => {
      viewport.dispatchEvent(createTouchEvent("touchstart", [
        { clientX: 100, clientY: 100 },
        { clientX: 200, clientY: 100 },
      ]));
      viewport.dispatchEvent(createTouchEvent("touchmove", [
        { clientX: 75, clientY: 100 },
        { clientX: 225, clientY: 100 },
      ]));
      viewport.dispatchEvent(createTouchEvent("touchend", []));
    });

    const nextTransform = parseLayerTransform(layer.style.transform);
    const scaleRatio = 1.5;
    expect(nextTransform.scale).toBeCloseTo(initialTransform.scale * scaleRatio);
    expect(nextTransform.x).toBeCloseTo(150 - scaleRatio * (150 - initialTransform.x));
    expect(nextTransform.y).toBeCloseTo(100 - scaleRatio * (100 - initialTransform.y));
  });
});

describe("OrgChart full-structure company wiring", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let queryClient: QueryClient;

  const familyTrust = createCompany("fam", "Family Trust", "FAM");
  const cornerstone = createCompany("cor", "Cornerstone Capital Holding LLC", "COR", "fam");
  const labs = createCompany("ebuaa", "E-Business Expert Group LLC", "EBUAA", "cor");
  const familyManager = createEnterpriseAgent(
    "agent-fam",
    "Family Trust Manager",
    "fam",
    "Family Trust",
    [
      createEnterpriseAgent(
        "agent-cor",
        "Cornerstone President",
        "cor",
        "Cornerstone Capital Holding LLC",
        [
          createEnterpriseAgent(
            "agent-ebuaa",
            "Labs President",
            "ebuaa",
            "E-Business Expert Group LLC",
          ),
        ],
      ),
    ],
  );
  const cornerstonePresident = familyManager.reports[0];
  const labsPresident = (cornerstonePresident as ReturnType<typeof createEnterpriseAgent>).reports[0];
  const familyAgents = [familyManager, cornerstonePresident, labsPresident];

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    companyContextMock.mockReturnValue({
      companies: [familyTrust, cornerstone, labs],
      selectedCompanyId: "fam",
      selectedCompany: familyTrust,
    });
    orgMock.mockResolvedValue([familyManager]);
    listMock.mockResolvedValue(familyAgents);
    enterpriseGraphMock.mockResolvedValue({
      companyId: "fam",
      roots: [familyManager],
      nodes: familyAgents,
      links: [
        {
          id: "link-cor-ebuaa",
          sourceAgentId: "agent-cor",
          sourceAgentName: "Cornerstone President",
          sourceCompanyId: "cor",
          sourceCompanyName: "Cornerstone Capital Holding LLC",
          targetAgentId: "agent-ebuaa",
          targetAgentName: "Labs President",
          targetCompanyId: "ebuaa",
          targetCompanyName: "E-Business Expert Group LLC",
          typeKey: "governs",
          typeLabel: "Governs",
          typeDescription: "Governance relationship",
          category: "governance",
          builtIn: true,
          notes: null,
        },
      ],
      availableTypes: [],
      workflowPacks: [],
    });
    window.localStorage.clear();

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return this.getAttribute("data-testid") === "org-chart-viewport" ? 1024 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get() {
        return this.getAttribute("data-testid") === "org-chart-viewport" ? 720 : 0;
      },
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getRect(this: HTMLElement) {
      if (this.getAttribute("data-testid") === "org-chart-viewport") {
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 1024,
          bottom: 720,
          width: 1024,
          height: 720,
          toJSON: () => ({}),
        };
      }
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      };
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  async function renderFullStructure() {
    root = createRoot(container);
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <OrgChart
            fullscreen
            compactFilters
            startExpanded
            lockViewMode="enterprise"
            enterpriseScope="family"
          />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();
  }

  it("keeps company-to-company links visible while agent cards are shown", async () => {
    await renderFullStructure();

    expect(container.querySelectorAll("[data-org-card]").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-company-aggregate-link]").length).toBeGreaterThan(0);
  });

  it("lets the Layers menu reorder companies and persists the color-key order", async () => {
    await renderFullStructure();

    const orderBefore = Array.from(container.querySelectorAll("[data-company-color-key]")).map(
      (item) => item.getAttribute("data-company-color-key"),
    );
    expect(orderBefore).toEqual(["cor", "ebuaa", "fam"]);

    const layersButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Layers"),
    ) as HTMLButtonElement;
    expect(layersButton).toBeTruthy();

    await act(async () => {
      layersButton.click();
    });
    await flushReact();

    const moveCornerstoneDown = document.querySelector(
      'button[aria-label="Move COR · Cornerstone Capital Holding LLC down"]',
    ) as HTMLButtonElement;
    expect(moveCornerstoneDown).toBeTruthy();

    await act(async () => {
      moveCornerstoneDown.click();
    });
    await flushReact();

    const orderAfter = Array.from(container.querySelectorAll("[data-company-color-key]")).map(
      (item) => item.getAttribute("data-company-color-key"),
    );
    expect(orderAfter).toEqual(["ebuaa", "cor", "fam"]);
    expect(window.localStorage.getItem("paperclip.orgChart.companyOrderIds:family:fam")).toContain(
      '"ebuaa","cor","fam"',
    );
  });
});
