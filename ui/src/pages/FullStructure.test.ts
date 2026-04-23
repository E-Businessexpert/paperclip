import type { Company, EnterpriseGraphOrgNode } from "@paperclipai/shared";
import { describe, expect, it } from "vitest";
import {
  collectCompanyHierarchyEdges,
  getRouteScopedCompanyIds,
} from "./FullStructure";

function company(id: string, name: string): Company {
  return {
    id,
    name,
    description: null,
    status: "active",
    pauseReason: null,
    pausedAt: null,
    issuePrefix: id.toUpperCase(),
    issueCounter: 0,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    requireBoardApprovalForNewAgents: true,
    feedbackDataSharingEnabled: false,
    feedbackDataSharingConsentAt: null,
    feedbackDataSharingConsentByUserId: null,
    feedbackDataSharingTermsVersion: null,
    brandColor: null,
    logoAssetId: null,
    logoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function orgNode(
  id: string,
  companyId: string,
  companyName: string,
  reports: EnterpriseGraphOrgNode[] = [],
): EnterpriseGraphOrgNode {
  return {
    id,
    name: `${companyName} Agent`,
    role: "general",
    status: "active",
    companyId,
    companyName,
    externalToCompany: false,
    reports,
  };
}

describe("full structure graph helpers", () => {
  it("labels parent-to-child company hierarchy without reversing reports-to semantics", () => {
    const edges = collectCompanyHierarchyEdges([
      orgNode("trust-steward", "fam", "Family Trust", [
        orgNode("cornerstone-president", "cor", "Cornerstone Capital"),
      ]),
    ]);

    expect(edges).toMatchObject([
      {
        sourceCompanyId: "fam",
        targetCompanyId: "cor",
        category: "hierarchy",
        label: "Hierarchy",
        kind: "hierarchy",
        count: 1,
      },
    ]);
  });

  it("scopes a company-prefixed full structure route to the connected company graph", () => {
    const companies = [
      company("fam", "Family Trust"),
      company("cor", "Cornerstone Capital"),
      company("ops", "Ops & Assets"),
      company("msg", "1ms Group"),
    ];
    const hierarchyEdges = collectCompanyHierarchyEdges([
      orgNode("trust-steward", "fam", "Family Trust", [
        orgNode("cornerstone-president", "cor", "Cornerstone Capital", [
          orgNode("ops-president", "ops", "Ops & Assets"),
        ]),
      ]),
      orgNode("isolated-president", "msg", "1ms Group"),
    ]);

    expect([...getRouteScopedCompanyIds(companies, hierarchyEdges, [], "fam")].sort()).toEqual([
      "cor",
      "fam",
      "ops",
    ]);
  });

  it("keeps the global full structure route unscoped when no company prefix is present", () => {
    const companies = [
      company("fam", "Family Trust"),
      company("msg", "1ms Group"),
    ];

    expect([...getRouteScopedCompanyIds(companies, [], [], null)].sort()).toEqual(["fam", "msg"]);
  });
});
