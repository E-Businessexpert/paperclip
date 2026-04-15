import { z } from "zod";
import {
  AGENT_ICON_NAMES,
  AGENT_ROLES,
  AGENT_STATUSES,
  INBOX_MINE_ISSUE_STATUS_FILTER,
} from "../constants.js";
import { agentAdapterTypeSchema } from "../adapter-type.js";
import { envConfigSchema } from "./secret.js";
import {
  BUILTIN_ENTERPRISE_RELATIONSHIP_TYPES,
  ENTERPRISE_RELATIONSHIP_CATEGORIES,
} from "../types/agent.js";

export const agentPermissionsSchema = z.object({
  canCreateAgents: z.boolean().optional().default(false),
  canDesignOrganizations: z.boolean().optional(),
  canManageRelationshipTypes: z.boolean().optional(),
  canManageServiceDiscovery: z.boolean().optional(),
  canManageDeploymentAssignments: z.boolean().optional(),
  canGenerateSystemTopology: z.boolean().optional(),
});

export const discoveredServiceKindSchema = z.enum(["virtual", "physical", "hybrid"]);
export const discoveredServiceHostKindSchema = z.enum([
  "container",
  "vm",
  "server",
  "workstation",
  "network_device",
  "hypervisor",
  "saas",
  "facility",
  "cloud_service",
  "other",
]);
export const discoveredServiceLifecycleStateSchema = z.enum([
  "planned",
  "active",
  "degraded",
  "retired",
  "unknown",
]);
export const discoveredSoftwareAssignmentKindSchema = z.enum([
  "software_deployed",
  "tool_available",
  "runtime_dependency",
  "service_dependency",
  "data_dependency",
  "network_dependency",
  "facility_dependency",
  "asset_assignment",
  "other",
]);

export const discoveredSoftwareAssignmentSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  category: z.string().trim().min(1).nullable(),
  assignmentKind: discoveredSoftwareAssignmentKindSchema,
  version: z.string().trim().min(1).nullable(),
  environment: z.string().trim().min(1).nullable(),
  endpoint: z.string().trim().min(1).nullable(),
  ports: z.array(z.number().int().nonnegative()).default([]),
  assignedAgentIds: z.array(z.string().uuid()).default([]),
  assignedCapabilityKeys: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().nullable(),
  tags: z.array(z.string().trim().min(1)).default([]),
  lastObservedAt: z.string().trim().min(1).nullable(),
});

export const discoveredServiceRecordSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  kind: discoveredServiceKindSchema,
  hostKind: discoveredServiceHostKindSchema,
  lifecycleState: discoveredServiceLifecycleStateSchema,
  environment: z.string().trim().min(1).nullable(),
  source: z.string().trim().min(1).nullable(),
  systemOfRecord: z.string().trim().min(1).nullable(),
  hostRef: z.string().trim().min(1).nullable(),
  ownerCompanyId: z.string().uuid().nullable(),
  ownerCompanyName: z.string().trim().min(1).nullable(),
  summary: z.string().nullable(),
  endpoint: z.string().trim().min(1).nullable(),
  ports: z.array(z.number().int().nonnegative()).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  lastDiscoveredAt: z.string().trim().min(1).nullable(),
  lastValidatedAt: z.string().trim().min(1).nullable(),
  softwareAssignments: z.array(discoveredSoftwareAssignmentSchema).default([]),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export const agentServiceDiscoveryCacheSchema = z.object({
  version: z.literal(1),
  cachedAt: z.string().trim().min(1).nullable(),
  scope: z.string().trim().min(1).nullable(),
  services: z.array(discoveredServiceRecordSchema).default([]),
});

export const updateAgentServiceDiscoveryCacheSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  source: z.string().trim().min(1).optional().nullable(),
  cache: agentServiceDiscoveryCacheSchema.nullable(),
});

export type UpdateAgentServiceDiscoveryCache = z.infer<typeof updateAgentServiceDiscoveryCacheSchema>;

const enterpriseRelationshipKeySchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z][A-Za-z0-9:_-]*$/, {
    message: "Relationship keys must start with a letter and use only letters, numbers, :, _, or -",
  });

const builtinEnterpriseRelationshipKeys = new Set(
  BUILTIN_ENTERPRISE_RELATIONSHIP_TYPES.map((definition) => definition.key),
);

export const enterpriseRelationshipCategorySchema = z.enum(ENTERPRISE_RELATIONSHIP_CATEGORIES);

export const enterpriseRelationshipTypeCustomDefinitionSchema = z.object({
  key: enterpriseRelationshipKeySchema,
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  category: enterpriseRelationshipCategorySchema,
  aiSemantics: z.string().trim().min(1).nullable().optional().default(null),
});

export const agentEnterpriseRelationshipLinkSchema = z.object({
  id: z.string().trim().min(1),
  typeKey: enterpriseRelationshipKeySchema,
  targetAgentId: z.string().uuid(),
  notes: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export const agentEnterpriseRelationshipsSchema = z
  .object({
    version: z.literal(1),
    updatedAt: z.string().trim().min(1).nullable(),
    customTypes: z.array(enterpriseRelationshipTypeCustomDefinitionSchema).default([]),
    links: z.array(agentEnterpriseRelationshipLinkSchema).default([]),
  })
  .superRefine((value, ctx) => {
    const customTypeKeys = new Set<string>();
    for (const [index, customType] of value.customTypes.entries()) {
      if (builtinEnterpriseRelationshipKeys.has(customType.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Custom relationship key '${customType.key}' conflicts with a built-in relationship type`,
          path: ["customTypes", index, "key"],
        });
      }
      if (customTypeKeys.has(customType.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate custom relationship key '${customType.key}'`,
          path: ["customTypes", index, "key"],
        });
      }
      customTypeKeys.add(customType.key);
    }

    const validTypeKeys = new Set([
      ...builtinEnterpriseRelationshipKeys,
      ...Array.from(customTypeKeys),
    ]);
    const linkIds = new Set<string>();
    const linkTargets = new Set<string>();
    for (const [index, link] of value.links.entries()) {
      if (!validTypeKeys.has(link.typeKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown relationship type '${link.typeKey}'`,
          path: ["links", index, "typeKey"],
        });
      }
      if (linkIds.has(link.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate relationship id '${link.id}'`,
          path: ["links", index, "id"],
        });
      }
      linkIds.add(link.id);

      const pairKey = `${link.typeKey}::${link.targetAgentId}`;
      if (linkTargets.has(pairKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate relationship target for the same type",
          path: ["links", index, "targetAgentId"],
        });
      }
      linkTargets.add(pairKey);
    }
  });

export const updateAgentEnterpriseRelationshipsSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  source: z.string().trim().min(1).optional().nullable(),
  relationships: agentEnterpriseRelationshipsSchema.nullable(),
});

export type UpdateAgentEnterpriseRelationships =
  z.infer<typeof updateAgentEnterpriseRelationshipsSchema>;

export const agentInstructionsBundleModeSchema = z.enum(["managed", "external"]);

export const updateAgentInstructionsBundleSchema = z.object({
  mode: agentInstructionsBundleModeSchema.optional(),
  rootPath: z.string().trim().min(1).nullable().optional(),
  entryFile: z.string().trim().min(1).optional(),
  clearLegacyPromptTemplate: z.boolean().optional().default(false),
});

export type UpdateAgentInstructionsBundle = z.infer<typeof updateAgentInstructionsBundleSchema>;

export const upsertAgentInstructionsFileSchema = z.object({
  path: z.string().trim().min(1),
  content: z.string(),
  clearLegacyPromptTemplate: z.boolean().optional().default(false),
});

export type UpsertAgentInstructionsFile = z.infer<typeof upsertAgentInstructionsFileSchema>;

const adapterConfigSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  const envValue = value.env;
  if (envValue === undefined) return;
  const parsed = envConfigSchema.safeParse(envValue);
  if (!parsed.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "adapterConfig.env must be a map of valid env bindings",
      path: ["env"],
    });
  }
});

export const createAgentSchema = z.object({
  name: z.string().min(1),
  role: z.enum(AGENT_ROLES).optional().default("general"),
  title: z.string().optional().nullable(),
  icon: z.enum(AGENT_ICON_NAMES).optional().nullable(),
  reportsTo: z.string().uuid().optional().nullable(),
  capabilities: z.string().optional().nullable(),
  desiredSkills: z.array(z.string().min(1)).optional(),
  adapterType: agentAdapterTypeSchema,
  adapterConfig: adapterConfigSchema.optional().default({}),
  runtimeConfig: z.record(z.unknown()).optional().default({}),
  budgetMonthlyCents: z.number().int().nonnegative().optional().default(0),
  permissions: agentPermissionsSchema.optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

export type CreateAgent = z.infer<typeof createAgentSchema>;

export const createAgentHireSchema = createAgentSchema.extend({
  sourceIssueId: z.string().uuid().optional().nullable(),
  sourceIssueIds: z.array(z.string().uuid()).optional(),
});

export type CreateAgentHire = z.infer<typeof createAgentHireSchema>;

export const updateAgentSchema = createAgentSchema
  .omit({ permissions: true })
  .partial()
  .extend({
    permissions: z.never().optional(),
    replaceAdapterConfig: z.boolean().optional(),
    status: z.enum(AGENT_STATUSES).optional(),
    spentMonthlyCents: z.number().int().nonnegative().optional(),
  });

export type UpdateAgent = z.infer<typeof updateAgentSchema>;

export const updateAgentInstructionsPathSchema = z.object({
  path: z.string().trim().min(1).nullable(),
  adapterConfigKey: z.string().trim().min(1).optional(),
});

export type UpdateAgentInstructionsPath = z.infer<typeof updateAgentInstructionsPathSchema>;

export const createAgentKeySchema = z.object({
  name: z.string().min(1).default("default"),
});

export type CreateAgentKey = z.infer<typeof createAgentKeySchema>;

export const agentMineInboxQuerySchema = z.object({
  userId: z.string().trim().min(1),
  status: z.string().trim().min(1).optional().default(INBOX_MINE_ISSUE_STATUS_FILTER),
});

export type AgentMineInboxQuery = z.infer<typeof agentMineInboxQuerySchema>;

export const wakeAgentSchema = z.object({
  source: z.enum(["timer", "assignment", "on_demand", "automation"]).optional().default("on_demand"),
  triggerDetail: z.enum(["manual", "ping", "callback", "system"]).optional(),
  reason: z.string().optional().nullable(),
  payload: z.record(z.unknown()).optional().nullable(),
  idempotencyKey: z.string().optional().nullable(),
  forceFreshSession: z.preprocess(
    (value) => (value === null ? undefined : value),
    z.boolean().optional().default(false),
  ),
});

export type WakeAgent = z.infer<typeof wakeAgentSchema>;

export const resetAgentSessionSchema = z.object({
  taskKey: z.string().min(1).optional().nullable(),
});

export type ResetAgentSession = z.infer<typeof resetAgentSessionSchema>;

export const testAdapterEnvironmentSchema = z.object({
  adapterConfig: adapterConfigSchema.optional().default({}),
});

export type TestAdapterEnvironment = z.infer<typeof testAdapterEnvironmentSchema>;

export const updateAgentPermissionsSchema = z.object({
  canCreateAgents: z.boolean(),
  canAssignTasks: z.boolean(),
  canDesignOrganizations: z.boolean().optional(),
  canManageRelationshipTypes: z.boolean().optional(),
  canManageServiceDiscovery: z.boolean().optional(),
  canManageDeploymentAssignments: z.boolean().optional(),
  canGenerateSystemTopology: z.boolean().optional(),
});

export type UpdateAgentPermissions = z.infer<typeof updateAgentPermissionsSchema>;
