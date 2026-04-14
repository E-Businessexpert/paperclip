# Enterprise Relationships

This document describes Paperclip's secondary enterprise relationship model.

## Purpose

Paperclip already supports one primary hierarchy edge through `reportsTo`. That gives each agent a single formal manager and keeps the org chart tree readable. Enterprise workflows also need secondary, typed relationships that do not replace the primary chain of command.

This feature adds typed secondary links so organizations can model matrix, governance, decision, and asset relationships across teams and companies without overloading `reportsTo`.

## Built-in relationship types

Paperclip now ships with these built-in relationship types:

- `dottedLineTo`
- `approvalsRequiredFrom`
- `assetAllocatedBy`
- `licensesFrom`
- `governedBy`

These built-ins are available to every company. They can be extended with company-specific custom relationship types.

## Data model

Secondary enterprise relationships are stored in `agent.metadata.enterpriseRelationships`.

```ts
type AgentEnterpriseRelationshipsRecord = {
  version: 1;
  updatedAt: string | null;
  customTypes: Array<{
    key: string;
    label: string;
    description: string;
    category: "matrix" | "decision" | "asset" | "governance" | "custom";
    aiSemantics: string | null;
  }>;
  links: Array<{
    id: string;
    typeKey: string;
    targetAgentId: string;
    notes: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
};
```

The server resolves this stored record into a richer view that includes:

- built-in and custom type definitions
- target agent name
- target company name
- target role
- target status
- broken-target detection

## Validation rules

Paperclip enforces these rules:

- relationship keys must be stable identifiers
- custom type keys cannot shadow built-in types
- custom relationship keys must be unique
- links must reference a known built-in or custom type
- `(typeKey, targetAgentId)` pairs must be unique
- link ids must be unique

## Permissions

Secondary relationship edits are controlled separately from generic metadata writes.

An actor can manage enterprise relationships when at least one of these is true:

- board scope access
- self-edit within the same company
- `agents:create`
- `permissions.canCreateAgents`
- `permissions.canDesignOrganizations`
- `permissions.canManageRelationshipTypes`

This keeps the feature aligned with AI-assisted organization design and enterprise topology generation.

## API

Generic agent metadata patching does not accept enterprise relationship writes.

Use:

```http
PUT /api/agents/:id/enterprise-relationships
```

Request shape:

```json
{
  "projectId": "optional-project-id",
  "source": "optional-source-tag",
  "relationships": {
    "version": 1,
    "updatedAt": null,
    "customTypes": [],
    "links": []
  }
}
```

Passing `relationships: null` removes the relationship record.

## Auditing

Writes through the dedicated route:

- record an activity event using `agent.enterprise_relationships_updated`
- create a configuration revision with source `enterprise_relationships_patch`

This keeps enterprise topology edits visible to operators and future governance tooling.

## Cleanup semantics

When an agent is removed, Paperclip also removes any secondary relationship links in other agents that target the deleted agent. If a relationship record becomes empty after cleanup, the server removes `metadata.enterpriseRelationships`.

## UI behavior

The Agent Detail configuration page provides:

- a read/write secondary relationship editor
- built-in relationship type visibility
- custom relationship type management
- link creation against the visible agent directory
- notes and AI semantics capture

This is intentionally separate from the primary `reportsTo` picker.

## Product direction

This release adds typed secondary relationships while preserving one primary manager. That supports:

- clean org-chart trees
- richer enterprise coordination
- AI-aware relationship semantics
- future enterprise graph views
- future workflow routing based on relationship type metadata
