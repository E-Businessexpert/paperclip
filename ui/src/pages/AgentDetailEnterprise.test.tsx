// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentDetail } from "@paperclipai/shared";
import { resolveEnterpriseRelationshipTypes } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentDetail as AgentDetailPage } from "./AgentDetail";

const mockNavigate = vi.hoisted(() => vi.fn());
const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());
const mockClosePanel = vi.hoisted(() => vi.fn());
const mockOpenNewIssue = vi.hoisted(() => vi.fn());
const mockPushToast = vi.hoisted(() => vi.fn());

const mockAgentsApi = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  listGlobal: vi.fn(),
  updatePermissions: vi.fn(),
  updateEnterpriseRelationships: vi.fn(),
  invoke: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  approve: vi.fn(),
  terminate: vi.fn(),
  resetSession: vi.fn(),
  update: vi.fn(),
  adapterModels: vi.fn(),
}));

const mockBudgetsApi = vi.hoisted(() => ({
  overview: vi.fn(),
  upsertPolicy: vi.fn(),
}));

function MockLink({
  to,
  children,
  className,
  ...props
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a href={to} className={className} {...props}>
      {children}
    </a>
  );
}

vi.mock("@/lib/router", () => ({
  Link: MockLink,
  Navigate: ({ to }: { to: string }) => <a href={to}>Navigate</a>,
  useBeforeUnload: () => undefined,
  useNavigate: () => mockNavigate,
  useParams: () => ({ companyPrefix: "FAM", agentId: "trust-steward", tab: "permissions" }),
}));

vi.mock("../api/agents", () => ({
  agentsApi: mockAgentsApi,
}));

vi.mock("../api/budgets", () => ({
  budgetsApi: mockBudgetsApi,
}));

vi.mock("../api/companySkills", () => ({
  companySkillsApi: {
    list: vi.fn(),
  },
}));

vi.mock("../api/heartbeats", () => ({
  heartbeatsApi: {
    list: vi.fn(),
    workspaceOperations: vi.fn(),
    workspaceOperationLog: vi.fn(),
  },
}));

vi.mock("../api/issues", () => ({
  issuesApi: {
    list: vi.fn(),
  },
}));

vi.mock("../api/activity", () => ({
  activityApi: {
    list: vi.fn(),
  },
}));

vi.mock("../api/instanceSettings", () => ({
  instanceSettingsApi: {
    getExperimental: vi.fn(),
  },
}));

vi.mock("../api/assets", () => ({
  assetsApi: {
    uploadImage: vi.fn(),
  },
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    companies: [
      { id: "fam-id", name: "Family Trust", issuePrefix: "FAM", status: "active" },
      { id: "cor-id", name: "Cornerstone Capital Holding LLC", issuePrefix: "COR", status: "active" },
    ],
    selectedCompanyId: "fam-id",
    setSelectedCompanyId: vi.fn(),
  }),
}));

vi.mock("../context/PanelContext", () => ({
  usePanel: () => ({ closePanel: mockClosePanel }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: mockSetBreadcrumbs }),
}));

vi.mock("../context/DialogContext", () => ({
  useDialogActions: () => ({ openNewIssue: mockOpenNewIssue }),
}));

vi.mock("../context/SidebarContext", () => ({
  useSidebar: () => ({ isMobile: false }),
}));

vi.mock("../context/ToastContext", () => ({
  useToastActions: () => ({ pushToast: mockPushToast }),
}));

vi.mock("../components/AgentConfigForm", () => ({
  AgentConfigForm: () => <div>Agent config form</div>,
}));

vi.mock("../components/AgentIconPicker", () => ({
  AgentIcon: () => <span>agent-icon</span>,
  AgentIconPicker: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../components/ActivityCharts", () => ({
  ChartCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  RunActivityChart: () => <div>Run chart</div>,
  PriorityChart: () => <div>Priority chart</div>,
  IssueStatusChart: () => <div>Status chart</div>,
  SuccessRateChart: () => <div>Success chart</div>,
}));

vi.mock("../components/MarkdownEditor", () => ({
  MarkdownEditor: () => <textarea aria-label="markdown editor" />,
}));

vi.mock("../components/MarkdownBody", () => ({
  MarkdownBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../adapters", () => ({
  buildTranscript: vi.fn(),
  getUIAdapter: vi.fn(),
  onAdapterChange: vi.fn(),
}));

vi.mock("@/adapters/use-adapter-capabilities", () => ({
  useAdapterCapabilities: () => () => ({ supportsInstructionsBundle: true }),
}));

vi.mock("../components/transcript/RunTranscriptView", () => ({
  RunTranscriptView: () => <div>transcript</div>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function agentDetail(): AgentDetail {
  return {
    id: "trust-steward-id",
    companyId: "fam-id",
    name: "Oussama Ben Rhouma Trust Steward",
    urlKey: "trust-steward",
    role: "ceo",
    title: "Trust Steward",
    icon: null,
    status: "active",
    reportsTo: null,
    capabilities: "Owns trust governance and owner compensation routing.",
    adapterType: "claude_local",
    adapterConfig: {
      model: "claude-sonnet",
      cwd: "C:/workspace/paperclip",
      password: "do-not-render",
    },
    runtimeConfig: { maxTurns: 5 },
    defaultEnvironmentId: "env-fam",
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: {
      canCreateAgents: true,
      canAssignTasks: true,
      canDesignOrganizations: true,
      canManageRelationshipTypes: true,
      canManageServiceDiscovery: true,
      canManageDeploymentAssignments: true,
      canGenerateSystemTopology: true,
    },
    lastHeartbeatAt: null,
    metadata: {
      department: "Family Trust",
      serviceDiscoveryCache: {
        version: 1,
        cachedAt: "2026-05-09T00:00:00.000Z",
        scope: "family",
        services: [
          {
            id: "vault",
            name: "Managed Vault",
            kind: "credential-store",
            hostKind: "internal",
            endpoint: "10.0.15.5",
            description: "Stores deployment and service credentials.",
            softwareAssignments: [
              {
                assignmentKind: "owner",
                assignedAgentIds: ["trust-steward-id"],
                assignedCapabilityKeys: ["service-discovery"],
                notes: "Trust steward can route access requests.",
              },
            ],
            metadata: { loginPassword: "secret-value" },
          },
        ],
      },
    },
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    chainOfCommand: [
      {
        id: "trust-steward-id",
        name: "Oussama Ben Rhouma Trust Steward",
        role: "ceo",
        title: "Trust Steward",
      },
    ],
    access: {
      canAssignTasks: true,
      taskAssignSource: "agent_creator",
      membership: null,
      grants: [],
    },
    enterpriseRelationships: {
      version: 1,
      updatedAt: "2026-05-09T00:00:00.000Z",
      customTypes: [],
      availableTypes: resolveEnterpriseRelationshipTypes(),
      links: [
        {
          id: "rel-owner-pay",
          targetAgentId: "treasury-id",
          typeKey: "budgetFundedBy",
          notes: "Owner-pay lane comes from COR treasury.",
          category: "finance",
          builtIn: true,
          typeLabel: "Budget funded by",
          typeDescription: "Funding lane",
          typeAiSemantics: null,
          brokenTarget: false,
          targetAgentName: "Treasury and Sweep Controller",
          targetCompanyId: "cor-id",
          targetCompanyName: "Cornerstone Capital Holding LLC",
          targetRole: "cfo",
          targetTitle: "Treasury and Sweep Controller",
          targetStatus: "active",
        },
      ],
    },
  };
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("AgentDetail enterprise dashboard", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const detail = agentDetail();
    mockAgentsApi.get.mockResolvedValue(detail);
    mockAgentsApi.listGlobal.mockResolvedValue([
      {
        ...detail,
        companyName: "Family Trust",
      },
      {
        ...detail,
        id: "treasury-id",
        companyId: "cor-id",
        companyName: "Cornerstone Capital Holding LLC",
        name: "Treasury and Sweep Controller",
        urlKey: "treasury-and-sweep-controller",
        role: "cfo",
        title: "Treasury and Sweep Controller",
      },
    ]);
    mockAgentsApi.list.mockResolvedValue([]);
    mockBudgetsApi.overview.mockResolvedValue({ policies: [] });
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders restored enterprise permissions, relationships, service discovery, and redacted metadata", async () => {
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AgentDetailPage />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();

    expect(container.textContent).toContain("Agent Permissions");
    expect(container.textContent).toContain("Relationship Workspace");
    expect(container.textContent).toContain("Treasury and Sweep Controller");
    expect(container.textContent).toContain("Can manage service discovery");
    expect(container.textContent).toContain("Service Discovery & Software Assignments");
    expect(container.textContent).toContain("Managed Vault");
    expect(container.textContent).toContain("Metadata & Runtime Configuration");
    expect(container.textContent).toContain("***REDACTED***");
    expect(container.textContent).not.toContain("secret-value");

    await act(async () => {
      root.unmount();
    });
  });
});
