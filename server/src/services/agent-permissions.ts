export type NormalizedAgentPermissions = Record<string, unknown> & {
  canCreateAgents: boolean;
  canAssignTasks: boolean;
};

export function defaultPermissionsForRole(role: string): NormalizedAgentPermissions {
  return {
    canCreateAgents: role === "ceo",
    canAssignTasks: role === "ceo",
    canDesignOrganizations: false,
    canManageRelationshipTypes: false,
    canManageServiceDiscovery: false,
    canManageDeploymentAssignments: false,
    canGenerateSystemTopology: false,
  };
}

export function normalizeAgentPermissions(
  permissions: unknown,
  role: string,
): NormalizedAgentPermissions {
  const defaults = defaultPermissionsForRole(role);
  if (typeof permissions !== "object" || permissions === null || Array.isArray(permissions)) {
    return defaults;
  }

  const record = permissions as Record<string, unknown>;
  return {
    canCreateAgents:
      typeof record.canCreateAgents === "boolean"
        ? record.canCreateAgents
        : defaults.canCreateAgents,
    canAssignTasks:
      typeof record.canAssignTasks === "boolean"
        ? record.canAssignTasks
        : defaults.canAssignTasks,
    canDesignOrganizations:
      typeof record.canDesignOrganizations === "boolean"
        ? record.canDesignOrganizations
        : defaults.canDesignOrganizations,
    canManageRelationshipTypes:
      typeof record.canManageRelationshipTypes === "boolean"
        ? record.canManageRelationshipTypes
        : defaults.canManageRelationshipTypes,
    canManageServiceDiscovery:
      typeof record.canManageServiceDiscovery === "boolean"
        ? record.canManageServiceDiscovery
        : defaults.canManageServiceDiscovery,
    canManageDeploymentAssignments:
      typeof record.canManageDeploymentAssignments === "boolean"
        ? record.canManageDeploymentAssignments
        : defaults.canManageDeploymentAssignments,
    canGenerateSystemTopology:
      typeof record.canGenerateSystemTopology === "boolean"
        ? record.canGenerateSystemTopology
        : defaults.canGenerateSystemTopology,
  };
}
