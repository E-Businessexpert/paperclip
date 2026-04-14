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
  "decision",
  "asset",
  "governance",
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
      key: "governedBy",
      label: "Governed by",
      description:
        "The target defines policy, oversight, compliance, or managerial governance rules that the source agent must follow.",
      category: "governance",
      aiSemantics:
        "Use this when the target provides governance, policy control, oversight, or bureau-style authority over the source agent.",
      builtIn: true,
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
