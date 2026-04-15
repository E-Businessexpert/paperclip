# Enterprise Relationships

This document describes Paperclip's secondary enterprise relationship model.

## Purpose

Paperclip already supports one primary hierarchy edge through `reportsTo`. That gives each agent a single formal manager and keeps the org chart tree readable. Enterprise workflows also need secondary, typed relationships that do not replace the primary chain of command.

This feature adds typed secondary links so organizations can model matrix, governance, decision, and asset relationships across teams and companies without overloading `reportsTo`.

## Built-in relationship types

Paperclip now ships with these built-in relationship types:

- `dottedLineTo`
- `receivesWorkFrom`
- `assignsWorkTo`
- `approvalsRequiredFrom`
- `escalatesTo`
- `clientOf`
- `serviceProviderFor`
- `assetAllocatedBy`
- `licensesFrom`
- `hostedBy`
- `supports`
- `dependsOn`
- `dataOwnedBy`
- `governedBy`
- `policyOwnedBy`
- `auditedBy`
- `securityApprovedBy`
- `legalReviewedBy`
- `budgetFundedBy`
- `financeReviewedBy`
- `statusReportedTo`
- `mustInform`

These built-ins are available to every company. They can be extended with company-specific custom relationship types.

Paperclip also ships with built-in template packs so users can start from reusable enterprise patterns instead of manually inventing relationship keys:

- `management_bureaucracy`
- `client_provider`
- `infrastructure_assets`
- `data_compliance`

Paperclip now also ships with built-in workflow packs so users can bootstrap
complete operational lanes instead of wiring each relationship by hand:

- `standard_shared_saas`
- `dedicated_managed_instance`
- `enterprise_custom`
- `ecommerce_website_cpanel`

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
    category:
      | "matrix"
      | "delivery"
      | "decision"
      | "service"
      | "asset"
      | "data"
      | "governance"
      | "finance"
      | "communication"
      | "custom";
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

Paperclip also exposes a company-scoped enterprise graph view:

```http
GET /api/companies/:companyId/enterprise-graph
```

This response includes:

- the formal hierarchy roots for the selected company scope
- the resolved enterprise-graph nodes for all included agents
- the resolved secondary relationship links in that scope
- the available relationship types
- the built-in workflow pack catalog

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
- built-in relationship templates with quick-add actions
- built-in template packs for common enterprise patterns
- grouped type dropdowns by category
- searchable, company-grouped target agent selection
- advanced custom relationship type management only when built-ins are not enough
- link creation against the visible agent directory
- notes and AI semantics capture

This is intentionally separate from the primary `reportsTo` picker.

The Org Chart page now provides two distinct modes:

- `Hierarchy`
  - formal `reportsTo` tree only
- `Enterprise Graph`
  - the same formal tree plus secondary enterprise-link overlays
  - relationship-category filtering
  - workflow-pack reference cards

This lets users see both chain-of-command and bureaucracy/service
relationships without collapsing the primary hierarchy.

## Product direction

This release adds typed secondary relationships, workflow packs, and an
enterprise graph overlay while preserving one primary manager. That supports:

- clean org-chart trees
- richer enterprise coordination
- AI-aware relationship semantics
- reusable workflow routing packs
- enterprise-graph visibility for shared-service and cross-company models
