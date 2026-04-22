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

export interface EnterpriseRelationshipTypeDefinition {
  key: string;
  label: string;
  description: string;
  category: EnterpriseRelationshipCategory;
  aiSemantics: string | null;
  builtIn: boolean;
}

export interface EnterpriseRelationshipTypeCustomDefinition {
  key: string;
  label: string;
  description: string;
  category: EnterpriseRelationshipCategory;
  aiSemantics?: string | null;
  builtIn?: false;
}

export interface AgentEnterpriseRelationshipLink {
  id: string;
  targetAgentId: string;
  typeKey: string;
  notes: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
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

export interface AgentEnterpriseRelationshipsRecord {
  version: 1;
  updatedAt: string | null;
  customTypes: EnterpriseRelationshipTypeCustomDefinition[];
  links: AgentEnterpriseRelationshipLink[];
}

export interface AgentEnterpriseRelationshipsView {
  version: 1;
  updatedAt: string | null;
  customTypes: EnterpriseRelationshipTypeCustomDefinition[];
  availableTypes: EnterpriseRelationshipTypeDefinition[];
  links: ResolvedAgentEnterpriseRelationshipLink[];
}

export interface EnterpriseWorkflowPackDefinition {
  key: string;
  label: string;
  description: string;
  appliesTo: string;
  stageLabels: string[];
  relationshipTypeKeys: string[];
  category?: EnterpriseRelationshipCategory;
}

export const BUILTIN_ENTERPRISE_RELATIONSHIP_TYPES = [
  {
    key: "matrix_reports_to",
    label: "Matrix reports to",
    description: "A dotted-line reporting relationship outside the primary org tree.",
    category: "matrix",
    aiSemantics: "Escalate visibility and alignment updates to the target agent.",
    builtIn: true,
  },
  {
    key: "delivery_owner",
    label: "Delivery owner",
    description: "The target agent owns delivery outcomes for the source agent.",
    category: "delivery",
    aiSemantics: "Coordinate delivery blockers, milestones, and handoffs with the target.",
    builtIn: true,
  },
  {
    key: "delivery_support",
    label: "Delivery support",
    description: "The target agent supports execution or fulfillment work.",
    category: "delivery",
    aiSemantics: "Ask the target for implementation help and execution status.",
    builtIn: true,
  },
  {
    key: "decision_approver",
    label: "Decision approver",
    description: "The target agent should approve decisions in this area.",
    category: "decision",
    aiSemantics: "Route high-impact decisions to the target before acting.",
    builtIn: true,
  },
  {
    key: "service_owner",
    label: "Service owner",
    description: "The target agent owns an internal or customer-facing service.",
    category: "service",
    aiSemantics: "Contact the target for service health, incidents, and API changes.",
    builtIn: true,
  },
  {
    key: "service_dependency",
    label: "Service dependency",
    description: "The source depends on a service owned or represented by the target.",
    category: "service",
    aiSemantics: "Check target availability and compatibility before making changes.",
    builtIn: true,
  },
  {
    key: "asset_owner",
    label: "Asset owner",
    description: "The target agent owns a system, repository, dataset, or operational asset.",
    category: "asset",
    aiSemantics: "Request asset access, ownership context, and change review from the target.",
    builtIn: true,
  },
  {
    key: "data_owner",
    label: "Data owner",
    description: "The target agent owns data quality, definitions, or governance.",
    category: "data",
    aiSemantics: "Confirm schema, lineage, privacy, and data quality with the target.",
    builtIn: true,
  },
  {
    key: "data_consumer",
    label: "Data consumer",
    description: "The target agent consumes data produced by the source agent.",
    category: "data",
    aiSemantics: "Notify the target before data contracts or output semantics change.",
    builtIn: true,
  },
  {
    key: "governance_reviewer",
    label: "Governance reviewer",
    description: "The target agent reviews policy, compliance, or risk-sensitive work.",
    category: "governance",
    aiSemantics: "Request governance review before shipping policy-sensitive changes.",
    builtIn: true,
  },
  {
    key: "finance_approver",
    label: "Finance approver",
    description: "The target agent approves spending, budgets, or financial decisions.",
    category: "finance",
    aiSemantics: "Route spend-impacting decisions to the target agent for approval.",
    builtIn: true,
  },
  {
    key: "communications_owner",
    label: "Communications owner",
    description: "The target agent owns stakeholder messaging or announcements.",
    category: "communication",
    aiSemantics: "Coordinate external or internal communications with the target.",
    builtIn: true,
  },
] satisfies EnterpriseRelationshipTypeDefinition[];

export const BUILTIN_ENTERPRISE_WORKFLOW_PACKS = [
  {
    key: "delivery-control",
    label: "Delivery control",
    description: "Map execution ownership, support paths, and approval handoffs.",
    appliesTo: "Delivery, project, and launch teams",
    stageLabels: ["Own", "Support", "Approve"],
    category: "delivery",
    relationshipTypeKeys: [
      "delivery_owner",
      "delivery_support",
      "decision_approver",
    ],
  },
  {
    key: "service-operations",
    label: "Service operations",
    description: "Connect services, dependencies, assets, and incident ownership.",
    appliesTo: "Platform, infrastructure, and service teams",
    stageLabels: ["Own", "Depend", "Operate"],
    category: "service",
    relationshipTypeKeys: [
      "service_owner",
      "service_dependency",
      "asset_owner",
    ],
  },
  {
    key: "data-governance",
    label: "Data governance",
    description: "Track data ownership, consumers, and governance review paths.",
    appliesTo: "Analytics, data, compliance, and AI teams",
    stageLabels: ["Own", "Consume", "Review"],
    category: "data",
    relationshipTypeKeys: [
      "data_owner",
      "data_consumer",
      "governance_reviewer",
    ],
  },
  {
    key: "executive-alignment",
    label: "Executive alignment",
    description: "Show matrix reporting, finance approval, and communication ownership.",
    appliesTo: "Executive, finance, and communications teams",
    stageLabels: ["Align", "Approve", "Communicate"],
    category: "matrix",
    relationshipTypeKeys: [
      "matrix_reports_to",
      "finance_approver",
      "communications_owner",
    ],
  },
] satisfies EnterpriseWorkflowPackDefinition[];

export function resolveEnterpriseRelationshipTypes(
  customTypes: EnterpriseRelationshipTypeCustomDefinition[] = [],
): EnterpriseRelationshipTypeDefinition[] {
  const resolved = new Map<string, EnterpriseRelationshipTypeDefinition>();

  for (const type of BUILTIN_ENTERPRISE_RELATIONSHIP_TYPES) {
    resolved.set(type.key, type);
  }

  for (const customType of customTypes) {
    resolved.set(customType.key, {
      ...customType,
      aiSemantics: customType.aiSemantics ?? null,
      builtIn: false,
    });
  }

  return [...resolved.values()].sort((left, right) => {
    const categoryOrder = left.category.localeCompare(right.category);
    if (categoryOrder !== 0) return categoryOrder;
    return left.label.localeCompare(right.label);
  });
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
  name: string;
  role: AgentRole;
  title: string | null;
}

export interface AgentMetadata extends Record<string, unknown> {
  enterpriseRelationships?: AgentEnterpriseRelationshipsRecord | null;
  serviceDiscoveryCache?: AgentServiceDiscoveryCache | null;
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
  metadata: AgentMetadata | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentDetail extends Agent {
  chainOfCommand: AgentChainOfCommandEntry[];
  access: AgentAccessState;
}

export interface EnterpriseGraphOrgNode {
  id: string;
  name: string;
  role: string;
  status: string;
  companyId: string;
  companyName: string | null;
  externalToCompany: boolean;
  reports: EnterpriseGraphOrgNode[];
}

export interface EnterpriseGraphNode extends Agent {
  companyName: string | null;
  externalToCompany: boolean;
  secondaryLinkCount: number;
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

export interface AgentServiceDiscoverySoftwareAssignment {
  id?: string | null;
  assignmentKind: string;
  assignedAgentIds?: string[];
  assignedCapabilityKeys?: string[];
  notes?: string | null;
}

export interface AgentServiceDiscoveryService {
  id: string;
  name: string;
  kind: string;
  hostKind: string;
  endpoint?: string | null;
  url?: string | null;
  description?: string | null;
  softwareAssignments?: AgentServiceDiscoverySoftwareAssignment[];
  metadata?: Record<string, unknown> | null;
}

export interface AgentServiceDiscoveryCache {
  version: 1;
  cachedAt: string | null;
  scope: string | null;
  services: AgentServiceDiscoveryService[];
}
