export type NormalizedAgentPermissions = Record<string, unknown> & {
  canCreateAgents: boolean;
  canDesignOrganizations: boolean;
  canManageRelationshipTypes: boolean;
  canManageServiceDiscovery: boolean;
  canManageDeploymentAssignments: boolean;
  canGenerateSystemTopology: boolean;
};

export function defaultPermissionsForRole(role: string): NormalizedAgentPermissions {
  return {
    canCreateAgents: role === "ceo",
    canDesignOrganizations: role === "ceo",
    canManageRelationshipTypes: role === "ceo",
    canManageServiceDiscovery: role === "ceo",
    canManageDeploymentAssignments: role === "ceo",
    canGenerateSystemTopology: role === "ceo",
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
  const canCreateAgents =
    typeof record.canCreateAgents === "boolean"
      ? record.canCreateAgents
      : defaults.canCreateAgents;
  const creatorDerivedDefault = defaults.canCreateAgents || canCreateAgents;

  return {
    canCreateAgents,
    canDesignOrganizations:
      typeof record.canDesignOrganizations === "boolean"
        ? record.canDesignOrganizations
        : creatorDerivedDefault,
    canManageRelationshipTypes:
      typeof record.canManageRelationshipTypes === "boolean"
        ? record.canManageRelationshipTypes
        : creatorDerivedDefault,
    canManageServiceDiscovery:
      typeof record.canManageServiceDiscovery === "boolean"
        ? record.canManageServiceDiscovery
        : creatorDerivedDefault,
    canManageDeploymentAssignments:
      typeof record.canManageDeploymentAssignments === "boolean"
        ? record.canManageDeploymentAssignments
        : creatorDerivedDefault,
    canGenerateSystemTopology:
      typeof record.canGenerateSystemTopology === "boolean"
        ? record.canGenerateSystemTopology
        : creatorDerivedDefault,
  };
}
