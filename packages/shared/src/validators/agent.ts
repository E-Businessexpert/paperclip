import { z } from "zod";
import {
  AGENT_ICON_NAMES,
  AGENT_ROLES,
  AGENT_STATUSES,
  INBOX_MINE_ISSUE_STATUS_FILTER,
} from "../constants.js";
import { agentAdapterTypeSchema } from "../adapter-type.js";
import { ENTERPRISE_RELATIONSHIP_CATEGORIES } from "../types/agent.js";
import { envConfigSchema } from "./secret.js";

export const agentPermissionsSchema = z.object({
  canCreateAgents: z.boolean().optional().default(false),
});

export const enterpriseRelationshipCategorySchema = z.enum(
  ENTERPRISE_RELATIONSHIP_CATEGORIES,
);

export const enterpriseRelationshipTypeCustomDefinitionSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    category: enterpriseRelationshipCategorySchema.default("custom"),
    aiSemantics: z.string().trim().min(1).max(500).nullable().optional(),
    builtIn: z.literal(false).optional(),
  })
  .passthrough();

export const agentEnterpriseRelationshipLinkSchema = z
  .object({
    id: z.string().trim().min(1),
    targetAgentId: z.string().trim().min(1),
    typeKey: z.string().trim().min(1).max(80),
    notes: z.string().trim().nullable().optional().default(null),
    createdAt: z.string().trim().min(1).nullable().optional(),
    updatedAt: z.string().trim().min(1).nullable().optional(),
  })
  .passthrough();

export const agentEnterpriseRelationshipsSchema = z
  .object({
    version: z.literal(1).optional().default(1),
    updatedAt: z.string().trim().min(1).nullable().optional().default(null),
    customTypes: z
      .array(enterpriseRelationshipTypeCustomDefinitionSchema)
      .optional()
      .default([]),
    links: z.array(agentEnterpriseRelationshipLinkSchema).optional().default([]),
  })
  .passthrough();

export type AgentEnterpriseRelationshipsInput = z.infer<
  typeof agentEnterpriseRelationshipsSchema
>;

export const updateAgentEnterpriseRelationshipsSchema = z.object({
  projectId: z.string().trim().min(1).nullable().optional(),
  source: z.string().trim().min(1).nullable().optional(),
  relationships: agentEnterpriseRelationshipsSchema.nullable(),
});

export type UpdateAgentEnterpriseRelationships = z.infer<
  typeof updateAgentEnterpriseRelationshipsSchema
>;

export const agentServiceDiscoverySoftwareAssignmentSchema = z
  .object({
    id: z.string().trim().min(1).nullable().optional(),
    assignmentKind: z.string().trim().min(1),
    assignedAgentIds: z.array(z.string().trim().min(1)).optional().default([]),
    assignedCapabilityKeys: z
      .array(z.string().trim().min(1))
      .optional()
      .default([]),
    notes: z.string().trim().nullable().optional(),
  })
  .passthrough();

export const agentServiceDiscoveryServiceSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    kind: z.string().trim().min(1),
    hostKind: z.string().trim().min(1),
    endpoint: z.string().trim().min(1).nullable().optional(),
    url: z.string().trim().min(1).nullable().optional(),
    description: z.string().trim().nullable().optional(),
    softwareAssignments: z
      .array(agentServiceDiscoverySoftwareAssignmentSchema)
      .optional()
      .default([]),
    metadata: z.record(z.unknown()).nullable().optional(),
  })
  .passthrough();

export const agentServiceDiscoveryCacheSchema = z
  .object({
    version: z.literal(1).optional().default(1),
    cachedAt: z.string().trim().min(1).nullable().optional().default(null),
    scope: z.string().trim().min(1).nullable().optional().default(null),
    services: z.array(agentServiceDiscoveryServiceSchema).optional().default([]),
  })
  .passthrough();

export type AgentServiceDiscoveryCacheInput = z.infer<
  typeof agentServiceDiscoveryCacheSchema
>;

export const updateAgentServiceDiscoveryCacheSchema = z.object({
  projectId: z.string().trim().min(1).nullable().optional(),
  source: z.string().trim().min(1).nullable().optional(),
  cache: agentServiceDiscoveryCacheSchema.nullable(),
});

export type UpdateAgentServiceDiscoveryCache = z.infer<
  typeof updateAgentServiceDiscoveryCacheSchema
>;

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
});

export type UpdateAgentPermissions = z.infer<typeof updateAgentPermissionsSchema>;
