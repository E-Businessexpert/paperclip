// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FullStructurePage } from "./FullStructure";

const mockSetSelectedCompanyId = vi.hoisted(() => vi.fn());
const routeState = vi.hoisted(() => ({
  companyPrefix: undefined as string | undefined,
  pathname: "/full-structure",
}));
const chartProps = vi.hoisted(() => ({
  latest: null as Record<string, unknown> | null,
}));

const companies = [
  {
    id: "fam",
    name: "Family Trust",
    issuePrefix: "FAM",
    status: "active",
    brandColor: null,
    logoUrl: null,
  },
  {
    id: "ebu",
    name: "E-Business Expert LLC",
    issuePrefix: "EBU",
    status: "active",
    brandColor: null,
    logoUrl: null,
  },
];

const companyContext = vi.hoisted(() => ({
  loading: false,
  selectedCompanyId: "ebu",
  selectedCompany: {
    id: "ebu",
    name: "E-Business Expert LLC",
    issuePrefix: "EBU",
    status: "active",
    brandColor: null,
    logoUrl: null,
  },
  selectionSource: "user" as const,
}));

vi.mock("@/lib/router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useLocation: () => ({ pathname: routeState.pathname, search: "", hash: "", state: null }),
  useParams: () => ({ companyPrefix: routeState.companyPrefix }),
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    companies,
    loading: companyContext.loading,
    selectedCompanyId: companyContext.selectedCompanyId,
    selectedCompany: companyContext.selectedCompany,
    selectionSource: companyContext.selectionSource,
    setSelectedCompanyId: mockSetSelectedCompanyId,
  }),
}));

vi.mock("./FullStructureEnterpriseOrgChart", () => ({
  FullStructureEnterpriseOrgChart: (props: Record<string, unknown>) => {
    chartProps.latest = props;
    return <div data-testid="full-structure-chart" />;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("FullStructurePage routing concept", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    routeState.companyPrefix = undefined;
    routeState.pathname = "/full-structure";
    companyContext.selectedCompanyId = "ebu";
    companyContext.selectedCompany = companies[1]!;
    companyContext.selectionSource = "user";
    chartProps.latest = null;
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("does not force the global full org view back to Family Trust", async () => {
    const root = createRoot(container);

    await act(async () => {
      root.render(<FullStructurePage />);
    });

    expect(mockSetSelectedCompanyId).not.toHaveBeenCalled();
    expect(chartProps.latest?.enterpriseScope).toBe("family");
    expect(chartProps.latest?.subtitle).toContain("seeded from E-Business Expert LLC");

    await act(async () => {
      root.unmount();
    });
  });

  it("uses the route company as the seed on company-prefixed full org links", async () => {
    routeState.companyPrefix = "FAM";
    routeState.pathname = "/FAM/full-structure";
    companyContext.selectedCompanyId = "ebu";
    companyContext.selectedCompany = companies[1]!;
    const root = createRoot(container);

    await act(async () => {
      root.render(<FullStructurePage />);
    });

    expect(mockSetSelectedCompanyId).toHaveBeenCalledWith("fam", { source: "route_sync" });
    expect(chartProps.latest?.subtitle).toContain("seeded from Family Trust");

    await act(async () => {
      root.unmount();
    });
  });
});
