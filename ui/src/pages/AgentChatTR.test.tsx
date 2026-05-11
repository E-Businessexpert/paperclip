// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentDirectoryEntry } from "@/api/agents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentChatTR } from "./AgentChatTR";

const mockAgentsApi = vi.hoisted(() => ({
  list: vi.fn(),
  listGlobal: vi.fn(),
  enterpriseGraph: vi.fn(),
  instructionsBundle: vi.fn(),
  instructionsFile: vi.fn(),
}));

const mockIssuesApi = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  addComment: vi.fn(),
  listComments: vi.fn(),
}));

const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());
const mockSearchParamsState = vi.hoisted(() => {
  const state = {
    params: new URLSearchParams(),
    setSearchParams: vi.fn((nextInit: unknown) => {
      const next =
        typeof nextInit === "function"
          ? (nextInit as (current: URLSearchParams) => URLSearchParams)(state.params)
          : nextInit;
      state.params = new URLSearchParams(next as URLSearchParams);
    }),
  };
  return state;
});

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

vi.mock("@/api/agents", () => ({
  agentsApi: mockAgentsApi,
}));

vi.mock("@/api/issues", () => ({
  issuesApi: mockIssuesApi,
}));

vi.mock("@/context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({
    setBreadcrumbs: mockSetBreadcrumbs,
  }),
}));

vi.mock("@/context/CompanyContext", () => ({
  useCompany: () => ({
    companies: [
      { id: "fam-id", name: "Family Trust", issuePrefix: "FAM", status: "active" },
      { id: "cor-id", name: "Cornerstone Capital Holding LLC", issuePrefix: "COR", status: "active" },
    ],
    selectedCompanyId: "cor-id",
    selectedCompany: {
      id: "cor-id",
      name: "Cornerstone Capital Holding LLC",
      issuePrefix: "COR",
      status: "active",
    },
  }),
}));

vi.mock("@/lib/router", () => ({
  Link: MockLink,
  useSearchParams: () => [mockSearchParamsState.params, mockSearchParamsState.setSearchParams],
}));

vi.mock("@/components/MarkdownBody", () => ({
  MarkdownBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function agent(overrides: Partial<AgentDirectoryEntry>): AgentDirectoryEntry {
  return {
    id: overrides.id ?? "agent-id",
    companyId: overrides.companyId ?? "cor-id",
    companyName: overrides.companyName ?? "Cornerstone Capital Holding LLC",
    name: overrides.name ?? "Agent",
    urlKey: overrides.urlKey ?? "agent",
    role: overrides.role ?? "pm",
    title: overrides.title ?? null,
    icon: overrides.icon ?? null,
    status: overrides.status ?? "active",
    reportsTo: overrides.reportsTo ?? null,
    capabilities: overrides.capabilities ?? null,
    adapterType: overrides.adapterType ?? "claude_local",
    adapterConfig: overrides.adapterConfig ?? {},
    runtimeConfig: overrides.runtimeConfig ?? {},
    budgetMonthlyCents: overrides.budgetMonthlyCents ?? 0,
    spentMonthlyCents: overrides.spentMonthlyCents ?? 0,
    pauseReason: overrides.pauseReason ?? null,
    pausedAt: overrides.pausedAt ?? null,
    permissions: overrides.permissions ?? {
      canCreateAgents: false,
      canAssignTasks: false,
      canDesignOrganizations: false,
      canManageRelationshipTypes: false,
      canManageServiceDiscovery: false,
      canManageDeploymentAssignments: false,
      canGenerateSystemTopology: false,
    },
    lastHeartbeatAt: overrides.lastHeartbeatAt ?? null,
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-05-01T00:00:00.000Z"),
  };
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function changeTextarea(textarea: HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  valueSetter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("AgentChatTR", () => {
  let container: HTMLDivElement;

  async function renderAgentChatTR(scope: "company" | "global") {
    const root = createRoot(container);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AgentChatTR scope={scope} />
        </QueryClientProvider>,
      );
    });
    await flushReact();
    await flushReact();
    return root;
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockSearchParamsState.params = new URLSearchParams();
    mockSearchParamsState.setSearchParams.mockClear();

    mockAgentsApi.listGlobal.mockResolvedValue([
      agent({
        id: "trust-owner",
        companyId: "fam-id",
        companyName: "Family Trust",
        name: "Oussama Ben Rhouma Trust Steward",
        role: "ceo",
        title: "Trust Steward and Owner",
        urlKey: "oussama-ben-rhouma-trust-steward",
      }),
      agent({
        id: "cornerstone-president",
        companyId: "cor-id",
        companyName: "Cornerstone Capital Holding LLC",
        name: "Cornerstone President",
        role: "ceo",
        title: "Cornerstone President",
        urlKey: "cornerstone-president",
      }),
    ]);
    mockAgentsApi.list.mockResolvedValue([]);
    mockAgentsApi.enterpriseGraph.mockResolvedValue({
      roots: [
        agent({
          id: "cornerstone-president",
          companyId: "cor-id",
          companyName: "Cornerstone Capital Holding LLC",
          name: "Cornerstone President",
          role: "ceo",
          title: "Cornerstone President",
          urlKey: "cornerstone-president",
        }),
      ],
      nodes: [
        agent({
          id: "cornerstone-president",
          companyId: "cor-id",
          companyName: "Cornerstone Capital Holding LLC",
          name: "Cornerstone President",
          role: "ceo",
          title: "Cornerstone President",
          urlKey: "cornerstone-president",
        }),
      ],
      links: [],
      relationshipTypes: [],
      workflowPacks: [],
    });
    mockAgentsApi.instructionsBundle.mockResolvedValue(null);
    mockAgentsApi.instructionsFile.mockResolvedValue(null);
    mockIssuesApi.list.mockResolvedValue([]);
    mockIssuesApi.create.mockResolvedValue({
      id: "conversation-issue-id",
      companyId: "cor-id",
      title: "[AgentChatTR] #cornerstone-holding-executive - Cornerstone President",
      description: "AgentChatTR-Agent-ID: cornerstone-president\nAgentChatTR-Room: #cornerstone-holding-executive",
      status: "todo",
      priority: "medium",
      assigneeAgentId: "cornerstone-president",
      assigneeUserId: null,
      identifier: "COR-99",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    mockIssuesApi.addComment.mockResolvedValue({
      id: "comment-id",
      companyId: "cor-id",
      issueId: "conversation-issue-id",
      authorType: "user",
      authorAgentId: null,
      authorUserId: "user-id",
      body: "Hello agent",
      presentation: null,
      metadata: null,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    mockIssuesApi.listComments.mockResolvedValue([]);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("opens the global CEO/trust-owner room across all visible companies", async () => {
    const root = await renderAgentChatTR("global");

    expect(mockAgentsApi.enterpriseGraph).toHaveBeenCalledWith("fam-id", "family");
    expect(container.textContent).toContain("Global AgentChatTR");
    expect(container.textContent).toContain("All visible companies");
    expect(container.textContent).toContain("Oussama Ben Rhouma Trust Steward");
    expect(container.textContent).toContain("Show directory");
    const directoryButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Show directory")) as HTMLButtonElement | undefined;
    expect(directoryButton).toBeTruthy();
    await act(async () => {
      directoryButton!.click();
    });
    await flushReact();
    expect(container.textContent).toContain("Cornerstone President");
    expect(container.textContent).toContain("Hide directory");
    expect(container.textContent).toContain("Chat mode");
    expect(container.textContent).toContain("Send to agent");
    expect(container.textContent).toContain("Generated fallback rooms");
    expect(container.textContent).toContain("#family-trust-executive");
    expect(container.querySelector('a[href="/FAM/agents/oussama-ben-rhouma-trust-steward"]')).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
  });

  it("opens a direct AgentChatTR room from the agentId query string", async () => {
    mockSearchParamsState.params = new URLSearchParams("agentId=cornerstone-president");
    const root = await renderAgentChatTR("global");
    await flushReact();

    expect(mockAgentsApi.instructionsBundle).toHaveBeenLastCalledWith("cornerstone-president", "cor-id");
    expect(mockIssuesApi.list).toHaveBeenLastCalledWith(
      "cor-id",
      expect.objectContaining({ assigneeAgentId: "cornerstone-president" }),
    );
    expect(container.textContent).toContain("#cornerstone-holding-executive");
    expect(container.textContent).toContain("#cornerstone-holding-relay");

    await act(async () => {
      root.unmount();
    });
  });

  it("sends chat messages through an issue-backed AgentChatTR room", async () => {
    const root = await renderAgentChatTR("company");

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
    expect(textarea).toBeTruthy();

    await act(async () => {
      changeTextarea(textarea!, "Hello agent");
    });
    await flushReact();

    const sendButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Send to agent")) as HTMLButtonElement | undefined;
    expect(sendButton).toBeTruthy();

    await act(async () => {
      sendButton!.click();
    });
    await flushReact();

    expect(mockIssuesApi.create).toHaveBeenCalledWith(
      "cor-id",
      expect.objectContaining({
        assigneeAgentId: "cornerstone-president",
        title: expect.stringContaining("[AgentChatTR]"),
      }),
    );
    expect(mockIssuesApi.addComment).toHaveBeenCalledWith(
      "conversation-issue-id",
      "Hello agent",
      true,
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps the company room scoped to the selected company's graph", async () => {
    const root = await renderAgentChatTR("company");

    expect(mockAgentsApi.enterpriseGraph).toHaveBeenCalledWith("cor-id", "company");
    expect(container.textContent).toContain("Company AgentChatTR");
    expect(container.textContent).toContain("Cornerstone President");
    expect(container.textContent).not.toContain("Oussama Ben Rhouma Trust Steward");

    await act(async () => {
      root.unmount();
    });
  });
});
