// @vitest-environment jsdom

import { act } from "react";
import type { ComponentProps, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDirectoryEntry } from "../api/agents";
import { ReportsToPicker } from "./ReportsToPicker";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./AgentIconPicker", () => ({
  AgentIcon: () => null,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function createAgent(
  id: string,
  name: string,
  companyId: string,
  companyName: string,
): AgentDirectoryEntry {
  const now = new Date("2026-04-14T12:00:00.000Z");
  return {
    id,
    companyId,
    companyName,
    name,
    urlKey: name.toLowerCase().replace(/\s+/g, "-"),
    role: "qa",
    title: name,
    icon: null,
    status: "active",
    reportsTo: null,
    capabilities: null,
    adapterType: "codex_local",
    adapterConfig: {},
    runtimeConfig: {},
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    pauseReason: null,
    pausedAt: null,
    permissions: {
      canCreateAgents: false,
    },
    lastHeartbeatAt: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
  };
}

function renderPicker(props: ComponentProps<typeof ReportsToPicker>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ReportsToPicker {...props} />);
  });
  return { container, root };
}

describe("ReportsToPicker", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows the external company label for a selected cross-company manager", () => {
    const localManager = createAgent("agent-local", "Local Lead", "company-labs", "Labs");
    const externalManager = createAgent("agent-external", "Group Director", "company-group", "E-Business Expert Group LLC");

    const { container, root } = renderPicker({
      agents: [localManager, externalManager],
      value: externalManager.id,
      onChange: vi.fn(),
      referenceCompanyId: localManager.companyId,
    });

    expect(container.textContent).toContain("Reports to Group Director");
    expect(container.textContent).toContain("E-Business Expert Group LLC");

    act(() => root.unmount());
  });

  it("renders external company labels in the visible manager directory", () => {
    const localManager = createAgent("agent-local", "Local Lead", "company-labs", "Labs");
    const externalManager = createAgent("agent-external", "Group Director", "company-group", "E-Business Expert Group LLC");

    const { container, root } = renderPicker({
      agents: [localManager, externalManager],
      value: null,
      onChange: vi.fn(),
      referenceCompanyId: localManager.companyId,
    });

    expect(container.textContent).toContain("Local Lead");
    expect(container.textContent).toContain("Group Director");
    expect(container.textContent).toContain("E-Business Expert Group LLC");

    act(() => root.unmount());
  });
});
