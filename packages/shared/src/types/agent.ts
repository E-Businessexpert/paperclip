import type {
  AgentAdapterType,
  PauseReason,
  AgentRole,
  AgentStatus,
} from "../constants.js";
import type {
  CompanyMembership,
  PrincipalPermissionGrant,
} from "./access.js";

export interface AgentPermissions {
  canCreateAgents: boolean;
  canDesignOrganizations?: boolean;
  canManageRelationshipTypes?: boolean;
  canManageServiceDiscovery?: boolean;
  canManageDeploymentAssignments?: boolean;
  canGenerateSystemTopology?: boolean;
}

export type DiscoveredServiceKind = "virtual" | "physical" | "hybrid";
export type DiscoveredServiceHostKind =
  | "container"
  | "vm"
  | "server"
  | "workstation"
  | "network_device"
  | "hypervisor"
  | "saas"
  | "facility"
  | "cloud_service"
  | "other";
export type DiscoveredServiceLifecycleState =
  | "planned"
  | "active"
  | "degraded"
  | "retired"
  | "unknown";
export type DiscoveredSoftwareAssignmentKind =
  | "software_deployed"
  | "tool_available"
  | "runtime_dependency"
  | "service_dependency"
  | "data_dependency"
  | "network_dependency"
  | "facility_dependency"
  | "asset_assignment"
  | "other";

export interface DiscoveredSoftwareAssignment {
  id: string;
  name: string;
  category: string | null;
  assignmentKind: DiscoveredSoftwareAssignmentKind;
  version: string | null;
  environment: string | null;
  endpoint: string | null;
  ports: number[];
  assignedAgentIds: string[];
  assignedCapabilityKeys: string[];
  notes: string | null;
  tags: string[];
  lastObservedAt: string | null;
}

export interface DiscoveredServiceRecord {
  id: string;
  name: string;
  kind: DiscoveredServiceKind;
  hostKind: DiscoveredServiceHostKind;
  lifecycleState: DiscoveredServiceLifecycleState;
  environment: string | null;
  source: string | null;
  systemOfRecord: string | null;
  hostRef: string | null;
  ownerCompanyId: string | null;
  ownerCompanyName: string | null;
  summary: string | null;
  endpoint: string | null;
  ports: number[];
  tags: string[];
  lastDiscoveredAt: string | null;
  lastValidatedAt: string | null;
  softwareAssignments: DiscoveredSoftwareAssignment[];
  metadata?: Record<string, unknown> | null;
}

export interface AgentServiceDiscoveryCache {
  version: 1;
  cachedAt: string | null;
  scope: string | null;
  services: DiscoveredServiceRecord[];
}

export const ENTERPRISE_RELATIONSHIP_CATEGORIES = [
  "matrix",
  "delivery",
  "decision",
  "service",
  "asset",
  "data",
  "governance",
  "finance",
  "communication",
  "custom",
] as const;

export type EnterpriseRelationshipCategory =
  (typeof ENTERPRISE_RELATIONSHIP_CATEGORIES)[number];

export interface EnterpriseRelationshipTypeCustomDefinition {
  key: string;
  label: string;
  description: string;
  category: EnterpriseRelationshipCategory;
  aiSemantics: string | null;
}

export interface EnterpriseRelationshipTypeDefinition
  extends EnterpriseRelationshipTypeCustomDefinition {
  builtIn: boolean;
}

export interface EnterpriseRelationshipTemplatePackDefinition {
  key: string;
  label: string;
  description: string;
  typeKeys: string[];
  aiSemantics: string | null;
}

export interface EnterpriseWorkflowPackDefinition {
  key: string;
  label: string;
  description: string;
  appliesTo: string;
  stageLabels: string[];
  relationshipTypeKeys: string[];
  discoveryExpectations: string[];
  actionLogExpectations: string[];
  aiSemantics: string | null;
}

export interface AgentEnterpriseRelationshipLink {
  id: string;
  typeKey: string;
  targetAgentId: string;
  notes: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AgentEnterpriseRelationshipsRecord {
  version: 1;
  updatedAt: string | null;
  customTypes: EnterpriseRelationshipTypeCustomDefinition[];
  links: AgentEnterpriseRelationshipLink[];
}

export interface ResolvedAgentEnterpriseRelationshipLink
  extends AgentEnterpriseRelationshipLink {
  category: EnterpriseRelationshipCategory;
  builtIn: boolean;
  typeLabel: string;
  typeDescription: string;
  typeAiSemantics: string | null;
  brokenTarget: boolean;
  targetAgentName: string | null;
  targetCompanyId: string | null;
  targetCompanyName: string | null;
  targetRole: AgentRole | null;
  targetTitle: string | null;
  targetStatus: AgentStatus | null;
}

export interface AgentEnterpriseRelationshipsView {
  version: 1;
  updatedAt: string | null;
  customTypes: EnterpriseRelationshipTypeCustomDefinition[];
  availableTypes: EnterpriseRelationshipTypeDefinition[];
  links: ResolvedAgentEnterpriseRelationshipLink[];
}

export interface EnterpriseGraphOrgNode {
  id: string;
  name: string;
  role: string;
  status: string;
  companyId?: string;
  companyName?: string | null;
  externalToCompany?: boolean;
  reports: EnterpriseGraphOrgNode[];
}

export interface EnterpriseGraphNode extends Agent {
  companyName?: string | null;
  externalToCompany?: boolean;
  secondaryLinkCount?: number;
}

export interface EnterpriseGraphLink {
  id: string;
  sourceAgentId: string;
  sourceAgentName: string;
  sourceCompanyId: string;
  sourceCompanyName: string | null;
  targetAgentId: string;
  targetAgentName: string;
  targetCompanyId: string;
  targetCompanyName: string | null;
  typeKey: string;
  typeLabel: string;
  typeDescription: string;
  category: EnterpriseRelationshipCategory;
  builtIn: boolean;
  notes: string | null;
}

export interface EnterpriseGraphView {
  companyId: string;
  roots: EnterpriseGraphOrgNode[];
  nodes: EnterpriseGraphNode[];
  links: EnterpriseGraphLink[];
  availableTypes: EnterpriseRelationshipTypeDefinition[];
  workflowPacks: EnterpriseWorkflowPackDefinition[];
}

export const BUILTIN_ENTERPRISE_RELATIONSHIP_TYPES: readonly EnterpriseRelationshipTypeDefinition[] =
  [
    {
      key: "dottedLineTo",
      label: "Dotted line to",
      description:
        "Advisory or matrix relationship. The target influences work and coaching, but is not the formal primary manager.",
      category: "matrix",
      aiSemantics:
        "Use this when the target provides secondary leadership, coordination, or guidance without replacing reportsTo.",
      builtIn: true,
    },
    {
      key: "receivesWorkFrom",
      label: "Receives work from",
      description:
        "The target is an upstream work source that assigns or routes delivery into the source agent's lane.",
      category: "delivery",
      aiSemantics:
        "Use this when the target is a practical work origin for the source agent's queue, backlog, or execution stream.",
      builtIn: true,
    },
    {
      key: "assignsWorkTo",
      label: "Assigns work to",
      description:
        "The source agent routes or assigns concrete work packages to the target for execution or follow-through.",
      category: "delivery",
      aiSemantics:
        "Use this when the source agent is responsible for handing execution work to the target without making the target its direct report.",
      builtIn: true,
    },
    {
      key: "approvalsRequiredFrom",
      label: "Approvals required from",
      description:
        "The target must approve defined decisions, work items, releases, or exceptions before execution can continue.",
      category: "decision",
      aiSemantics:
        "Use this when the target holds approval authority over the source agent's work, budget, release, or exception path.",
      builtIn: true,
    },
    {
      key: "escalatesTo",
      label: "Escalates to",
      description:
        "The target is the secondary escalation destination when the source agent needs a higher-level intervention, ruling, or unblock.",
      category: "decision",
      aiSemantics:
        "Use this when the target is the explicit escalation endpoint for operational deadlocks, exceptions, or conflicts.",
      builtIn: true,
    },
    {
      key: "clientOf",
      label: "Client of",
      description:
        "The source agent consumes an internal or external service from the target as its client or customer.",
      category: "service",
      aiSemantics:
        "Use this when the source agent depends on the target as a service provider, internal vendor, or managed partner.",
      builtIn: true,
    },
    {
      key: "serviceProviderFor",
      label: "Service provider for",
      description:
        "The source agent provides an internal or external service to the target in a provider or operator capacity.",
      category: "service",
      aiSemantics:
        "Use this when the source agent delivers a managed capability, platform, or support service to the target.",
      builtIn: true,
    },
    {
      key: "assetAllocatedBy",
      label: "Asset allocated by",
      description:
        "The target allocates physical or digital assets that the source agent depends on to operate.",
      category: "asset",
      aiSemantics:
        "Use this when the target provides hardware, workspace, infrastructure assets, or operational equipment to the source agent.",
      builtIn: true,
    },
    {
      key: "licensesFrom",
      label: "Licenses from",
      description:
        "The target provides software, platform, or intellectual-property licensing required for the source agent's work.",
      category: "asset",
      aiSemantics:
        "Use this when the target grants the source agent access to software entitlements, IP rights, product rights, or platform licenses.",
      builtIn: true,
    },
    {
      key: "hostedBy",
      label: "Hosted by",
      description:
        "The target hosts the source agent's workload, runtime, or platform environment.",
      category: "asset",
      aiSemantics:
        "Use this when the target owns the hosting surface, server, cluster, or runtime platform that the source agent depends on.",
      builtIn: true,
    },
    {
      key: "supports",
      label: "Supports",
      description:
        "The source agent provides recurring operational, technical, or coordination support to the target.",
      category: "delivery",
      aiSemantics:
        "Use this when the source agent materially helps the target succeed without acting as the target's formal manager.",
      builtIn: true,
    },
    {
      key: "dependsOn",
      label: "Depends on",
      description:
        "The source agent cannot fully complete its work without an input, service, asset, or decision from the target.",
      category: "delivery",
      aiSemantics:
        "Use this when the target is a dependency for the source agent's normal execution path.",
      builtIn: true,
    },
    {
      key: "dataOwnedBy",
      label: "Data owned by",
      description:
        "The target is the owner or steward of the data domain the source agent uses, modifies, or depends on.",
      category: "data",
      aiSemantics:
        "Use this when the target is responsible for data authority, stewardship, or domain ownership affecting the source agent.",
      builtIn: true,
    },
    {
      key: "governedBy",
      label: "Governed by",
      description:
        "The target defines policy, oversight, compliance, or managerial governance rules that the source agent must follow.",
      category: "governance",
      aiSemantics:
        "Use this when the target provides governance, policy control, oversight, or bureau-style authority over the source agent.",
      builtIn: true,
    },
    {
      key: "policyOwnedBy",
      label: "Policy owned by",
      description:
        "The target owns the formal policy, operating rule, or standard that the source agent must follow.",
      category: "governance",
      aiSemantics:
        "Use this when the target is the canonical policy owner for the source agent's process, controls, or standards.",
      builtIn: true,
    },
    {
      key: "auditedBy",
      label: "Audited by",
      description:
        "The target inspects, audits, or reviews the source agent's work for compliance, evidence, or control validation.",
      category: "governance",
      aiSemantics:
        "Use this when the target provides audit or assurance oversight over the source agent.",
      builtIn: true,
    },
    {
      key: "securityApprovedBy",
      label: "Security approved by",
      description:
        "The target holds the security approval gate for the source agent's system, release, workflow, or exception.",
      category: "governance",
      aiSemantics:
        "Use this when the target is the security sign-off authority for the source agent's work.",
      builtIn: true,
    },
    {
      key: "legalReviewedBy",
      label: "Legal reviewed by",
      description:
        "The target provides legal review, terms review, policy review, or contract review for the source agent's work.",
      category: "governance",
      aiSemantics:
        "Use this when the target is the legal review authority for decisions or documents tied to the source agent.",
      builtIn: true,
    },
    {
      key: "budgetFundedBy",
      label: "Budget funded by",
      description:
        "The target provides the budget, funding lane, or internal spending authority that enables the source agent's work.",
      category: "finance",
      aiSemantics:
        "Use this when the target is the funding source or budget sponsor for the source agent.",
      builtIn: true,
    },
    {
      key: "financeReviewedBy",
      label: "Finance reviewed by",
      description:
        "The target reviews the source agent's financial implications, billing structure, chargeback, or spend decisions.",
      category: "finance",
      aiSemantics:
        "Use this when the target is the finance control or review checkpoint for the source agent's work.",
      builtIn: true,
    },
    {
      key: "statusReportedTo",
      label: "Status reported to",
      description:
        "The source agent owes recurring status, progress, or operational reporting to the target.",
      category: "communication",
      aiSemantics:
        "Use this when the target must receive structured updates from the source agent as part of routine oversight.",
      builtIn: true,
    },
    {
      key: "mustInform",
      label: "Must inform",
      description:
        "The source agent must notify the target when relevant changes, incidents, milestones, or decisions occur.",
      category: "communication",
      aiSemantics:
        "Use this when the target needs notification visibility from the source agent even without being the approver or primary manager.",
      builtIn: true,
    },
  ] as const;

export const BUILTIN_ENTERPRISE_RELATIONSHIP_TEMPLATE_PACKS: readonly EnterpriseRelationshipTemplatePackDefinition[] =
  [
    {
      key: "management_bureaucracy",
      label: "Management & bureaucracy",
      description:
        "Primary enterprise bureaucracy pack for matrix leadership, approvals, escalation, governance, and reporting visibility.",
      typeKeys: [
        "dottedLineTo",
        "approvalsRequiredFrom",
        "escalatesTo",
        "governedBy",
        "statusReportedTo",
        "mustInform",
      ],
      aiSemantics:
        "Use this pack when modeling formal enterprise oversight without changing the primary reportsTo chain.",
    },
    {
      key: "client_provider",
      label: "Client & provider",
      description:
        "Shared-services pack for internal clients, providers, work routing, and operational dependencies.",
      typeKeys: [
        "clientOf",
        "serviceProviderFor",
        "receivesWorkFrom",
        "assignsWorkTo",
        "supports",
        "dependsOn",
      ],
      aiSemantics:
        "Use this pack when teams serve each other through managed services, delivery lanes, or internal client-provider relationships.",
    },
    {
      key: "infrastructure_assets",
      label: "Infrastructure & assets",
      description:
        "Infrastructure pack for allocation, hosting, licensing, and budget sponsorship relationships.",
      typeKeys: [
        "assetAllocatedBy",
        "licensesFrom",
        "hostedBy",
        "budgetFundedBy",
      ],
      aiSemantics:
        "Use this pack when modeling who provides the environments, entitlements, hardware, and budget enabling the work.",
    },
    {
      key: "data_compliance",
      label: "Data & compliance",
      description:
        "Governance pack for data ownership, policy control, audit, and legal or security review flows.",
      typeKeys: [
        "dataOwnedBy",
        "policyOwnedBy",
        "auditedBy",
        "securityApprovedBy",
        "legalReviewedBy",
        "financeReviewedBy",
      ],
      aiSemantics:
        "Use this pack when the enterprise model needs explicit ownership and compliance review semantics around data, policy, and control functions.",
    },
  ] as const;

export const BUILTIN_ENTERPRISE_WORKFLOW_PACKS: readonly EnterpriseWorkflowPackDefinition[] =
  [
    {
      key: "standard_shared_saas",
      label: "Standard shared SaaS",
      description:
        "Use for customers consuming an already deployed shared SaaS application without a dedicated instance or custom engineering path.",
      appliesTo:
        "Shared SaaS onboarding, customer success, tenant operations, and recurring service support inside the existing shared platform.",
      stageLabels: [
        "Customer intake",
        "Tenant activation",
        "Shared service operations",
        "Customer success",
      ],
      relationshipTypeKeys: [
        "clientOf",
        "serviceProviderFor",
        "statusReportedTo",
        "mustInform",
      ],
      discoveryExpectations: [
        "Reuse the standing shared deployment awareness cache.",
        "Reference the shared tenant, platform, and dependency inventory instead of requesting new infrastructure discovery.",
      ],
      actionLogExpectations: [
        "Log the customer-facing event at the company level.",
        "Log the tenant or instance event at the project or service lane only when the action changes shared SaaS state.",
      ],
      aiSemantics:
        "Route normal shared SaaS work through the standing operator and support chain without escalating to dedicated provisioning lanes unless an exception appears.",
    },
    {
      key: "dedicated_managed_instance",
      label: "Dedicated managed instance",
      description:
        "Use when a customer needs a separate managed tenant, dedicated hosting shape, or exception-approved provisioning path.",
      appliesTo:
        "Dedicated instances, premium managed environments, special hosting requests, and controlled exception routing through the shared delivery bridge.",
      stageLabels: [
        "Commercial approval",
        "Shared delivery bridge",
        "Provisioning and allocation",
        "Instance validation",
        "Managed handoff",
      ],
      relationshipTypeKeys: [
        "approvalsRequiredFrom",
        "serviceProviderFor",
        "assetAllocatedBy",
        "licensesFrom",
        "hostedBy",
        "statusReportedTo",
      ],
      discoveryExpectations: [
        "Write a dedicated environment record into service discovery.",
        "Record the assigned software, runtime dependencies, and hosting endpoints for the new instance.",
      ],
      actionLogExpectations: [
        "Log each provisioning and approval step at both company and project scope.",
        "Preserve the final deployment assignment record for later agent reuse.",
      ],
      aiSemantics:
        "Escalate to the shared delivery and allocation path when a separate instance is required, and capture the dedicated deployment state for future automation.",
    },
    {
      key: "enterprise_custom",
      label: "Enterprise custom",
      description:
        "Use for custom-plan customers that need tailored workflows, additional approvals, or Labs engineering involvement beyond standard service delivery.",
      appliesTo:
        "Enterprise custom plans, bespoke integrations, tailored deployments, custom code, and high-touch shared-services coordination.",
      stageLabels: [
        "Sales and scope",
        "Group orchestration",
        "Labs engineering",
        "Infrastructure and licensing",
        "Release and acceptance",
      ],
      relationshipTypeKeys: [
        "approvalsRequiredFrom",
        "dottedLineTo",
        "serviceProviderFor",
        "clientOf",
        "assetAllocatedBy",
        "licensesFrom",
        "governedBy",
        "statusReportedTo",
      ],
      discoveryExpectations: [
        "Create or update dedicated discovery records for custom environments and dependencies.",
        "Write the resulting software assignment map back into the reusable deployment-awareness cache.",
      ],
      actionLogExpectations: [
        "Log every scoped decision at company, project, and release level.",
        "Keep the acceptance and release evidence tied to the custom project for future audits and reuse.",
      ],
      aiSemantics:
        "Treat the operating company as the client-facing owner, route delivery through the Group bridge, involve Labs for product and custom engineering, and involve asset allocators only when dedicated hosting or licensing is required.",
    },
    {
      key: "ecommerce_website_cpanel",
      label: "E-commerce website / cPanel",
      description:
        "Use for websites or retail workloads that usually live on shared hosting or cPanel, but may escalate into dedicated infrastructure when needed.",
      appliesTo:
        "E-commerce websites, cPanel-based hosting, retail site operations, and lightweight managed web deployments.",
      stageLabels: [
        "Retail intake",
        "Software routing",
        "Shared hosting assignment",
        "Website launch",
        "Support and care",
      ],
      relationshipTypeKeys: [
        "clientOf",
        "serviceProviderFor",
        "licensesFrom",
        "assetAllocatedBy",
        "supports",
        "mustInform",
      ],
      discoveryExpectations: [
        "Record the cPanel account or shared hosting target in service discovery.",
        "Escalate to dedicated server and license assignments only when the website leaves the shared hosting lane.",
      ],
      actionLogExpectations: [
        "Log the originating retail request in the operating company lane.",
        "Log shared-hosting or dedicated-hosting changes in the linked software and infrastructure project scopes.",
      ],
      aiSemantics:
        "Keep routine website and shared-hosting work in the operating lane, but route dedicated hosting and separate licensing back through the shared service bridge when the website needs its own infrastructure footprint.",
    },
  ] as const;

export function resolveEnterpriseRelationshipTypes(
  customTypes: EnterpriseRelationshipTypeCustomDefinition[] = [],
): EnterpriseRelationshipTypeDefinition[] {
  const definitions: EnterpriseRelationshipTypeDefinition[] =
    BUILTIN_ENTERPRISE_RELATIONSHIP_TYPES.map((definition) => ({ ...definition }));
  const seenKeys = new Set(definitions.map((definition) => definition.key));

  for (const customType of customTypes) {
    const key = customType.key.trim();
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    definitions.push({
      key,
      label: customType.label.trim(),
      description: customType.description.trim(),
      category: customType.category,
      aiSemantics:
        typeof customType.aiSemantics === "string" &&
        customType.aiSemantics.trim().length > 0
          ? customType.aiSemantics.trim()
          : null,
      builtIn: false,
    });
  }

  return definitions;
}

export interface AgentMetadataRecord extends Record<string, unknown> {
  serviceDiscoveryCache?: AgentServiceDiscoveryCache;
  enterpriseRelationships?: AgentEnterpriseRelationshipsRecord;
}

export type AgentInstructionsBundleMode = "managed" | "external";

export interface AgentInstructionsFileSummary {
  path: string;
  size: number;
  language: string;
  markdown: boolean;
  isEntryFile: boolean;
  editable: boolean;
  deprecated: boolean;
  virtual: boolean;
}

export interface AgentInstructionsFileDetail extends AgentInstructionsFileSummary {
  content: string;
}

export interface AgentInstructionsBundle {
  agentId: string;
  companyId: string;
  mode: AgentInstructionsBundleMode | null;
  rootPath: string | null;
  managedRootPath: string;
  entryFile: string;
  resolvedEntryPath: string | null;
  editable: boolean;
  warnings: string[];
  legacyPromptTemplateActive: boolean;
  legacyBootstrapPromptTemplateActive: boolean;
  files: AgentInstructionsFileSummary[];
}

export interface AgentAccessState {
  canAssignTasks: boolean;
  taskAssignSource: "explicit_grant" | "agent_creator" | "ceo_role" | "none";
  membership: CompanyMembership | null;
  grants: PrincipalPermissionGrant[];
}

export interface AgentChainOfCommandEntry {
  id: string;
  companyId: string;
  companyName: string | null;
  name: string;
  role: AgentRole;
  title: string | null;
}

export interface Agent {
  id: string;
  companyId: string;
  name: string;
  urlKey: string;
  role: AgentRole;
  title: string | null;
  icon: string | null;
  status: AgentStatus;
  reportsTo: string | null;
  capabilities: string | null;
  adapterType: AgentAdapterType;
  adapterConfig: Record<string, unknown>;
  runtimeConfig: Record<string, unknown>;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  pauseReason: PauseReason | null;
  pausedAt: Date | null;
  permissions: AgentPermissions;
  lastHeartbeatAt: Date | null;
  metadata: AgentMetadataRecord | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentDetail extends Agent {
  chainOfCommand: AgentChainOfCommandEntry[];
  access: AgentAccessState;
  enterpriseRelationships: AgentEnterpriseRelationshipsView;
}

export interface AgentKeyCreated {
  id: string;
  name: string;
  token: string;
  createdAt: Date;
}

export interface AgentConfigRevision {
  id: string;
  companyId: string;
  agentId: string;
  createdByAgentId: string | null;
  createdByUserId: string | null;
  source: string;
  rolledBackFromRevisionId: string | null;
  changedKeys: string[];
  beforeConfig: Record<string, unknown>;
  afterConfig: Record<string, unknown>;
  createdAt: Date;
}

export type AdapterEnvironmentCheckLevel = "info" | "warn" | "error";
export type AdapterEnvironmentTestStatus = "pass" | "warn" | "fail";

export interface AdapterEnvironmentCheck {
  code: string;
  level: AdapterEnvironmentCheckLevel;
  message: string;
  detail?: string | null;
  hint?: string | null;
}

export interface AdapterEnvironmentTestResult {
  adapterType: string;
  status: AdapterEnvironmentTestStatus;
  checks: AdapterEnvironmentCheck[];
  testedAt: string;
}
