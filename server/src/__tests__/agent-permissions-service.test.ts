import { describe, expect, it } from "vitest";
import { defaultPermissionsForRole, normalizeAgentPermissions } from "../services/agent-permissions.js";

describe("agent permission normalization", () => {
  it("grants system design permissions to CEO roles by default", () => {
    const permissions = defaultPermissionsForRole("ceo");

    expect(permissions.canCreateAgents).toBe(true);
    expect(permissions.canDesignOrganizations).toBe(true);
    expect(permissions.canManageRelationshipTypes).toBe(true);
    expect(permissions.canManageServiceDiscovery).toBe(true);
    expect(permissions.canManageDeploymentAssignments).toBe(true);
    expect(permissions.canGenerateSystemTopology).toBe(true);
  });

  it("inherits system design permissions from agent creation rights when omitted", () => {
    const permissions = normalizeAgentPermissions({ canCreateAgents: true }, "engineer");

    expect(permissions.canCreateAgents).toBe(true);
    expect(permissions.canDesignOrganizations).toBe(true);
    expect(permissions.canManageRelationshipTypes).toBe(true);
    expect(permissions.canManageServiceDiscovery).toBe(true);
    expect(permissions.canManageDeploymentAssignments).toBe(true);
    expect(permissions.canGenerateSystemTopology).toBe(true);
  });

  it("keeps explicit system design overrides when creator rights are disabled", () => {
    const permissions = normalizeAgentPermissions(
      {
        canCreateAgents: false,
        canDesignOrganizations: true,
        canManageRelationshipTypes: false,
        canManageServiceDiscovery: true,
        canManageDeploymentAssignments: true,
        canGenerateSystemTopology: false,
      },
      "engineer",
    );

    expect(permissions.canCreateAgents).toBe(false);
    expect(permissions.canDesignOrganizations).toBe(true);
    expect(permissions.canManageRelationshipTypes).toBe(false);
    expect(permissions.canManageServiceDiscovery).toBe(true);
    expect(permissions.canManageDeploymentAssignments).toBe(true);
    expect(permissions.canGenerateSystemTopology).toBe(false);
  });
});
