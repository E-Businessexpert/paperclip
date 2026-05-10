# Enterprise Restore Audit - 2026-05-10

Purpose: preserve the E-Business Expert enterprise hierarchy and local Paperclip extensions during upstream Paperclip merges.

## Responsible Lane

- Company: E-Business Expert Labs LLC (`EBUAAA` in the live DB).
- Team lane: Paperclip control-plane/runtime governance.
- Responsible agents to keep aligned: Live Org Sync and Configuration Director, Paperclip Enterprise Relationship and Workflow Architect, Paperclip QA and Acceptance Lead, deployed app portfolio/service-discovery agents.
- Project folder: Paperclip control-plane project inside the E-Business Expert Labs company package and this deployment repo.

## Live Audit Result

Verified against the live embedded Postgres database on `ai-agency`:

- Companies table has `parent_company_id`, FK `companies_parent_company_id_fkey`, and index `companies_parent_company_id_idx`.
- Live company hierarchy:
  - `FAM` Family Trust is root.
  - `COR` Cornerstone Capital Holding LLC reports under `FAM`.
  - `EBUAA` E-Business Expert Group LLC reports under `COR`.
  - `EBUAAA` E-Business Expert Labs LLC reports under `COR`.
  - `MSG` 1ms Group LLC reports under `COR`.
  - `OPS` Ops & Assets LLC reports under `COR`.
  - `REA` Real Estate LLC reports under `COR`.
  - `EBUA` E-Business Expert Management reports under `EBUAA`.
  - `EBU` E-Business Expert LLC reports under `EBUA`.
  - `ECO` E-Commerce Expert LLC reports under `EBUA`.
- Formal cross-company agent `reportsTo` links are present:
  - Cornerstone President -> Oussama Ben Rhouma Trust Steward.
  - Tech Manager President -> Board of Presidents and Directors Chair.
  - Labs President -> Board of Presidents and Directors Chair.
  - Infrastructure Shield President -> Board of Presidents and Directors Chair.
  - Asset Shield President -> Board of Presidents and Directors Chair.
  - Real Estate President -> Board of Presidents and Directors Chair.
  - CEO Office President -> Tech Manager President.
  - Executive Office President -> CEO Office President.
  - Retail Manager President -> CEO Office President.
- FAM internal tree is present:
  - Family Trust -> Family Trust Manager -> Members -> Lara, Maryam, Oussama.
- 442 live agents have adapter type/config, service-discovery cache, relationship workspace, identity, run policy, workspace metadata, skill metadata, deployment awareness, and enterprise permission flags.
- Explicit `enterpriseRelationships.links` currently exist on the Family Trust Manager and Cornerstone President. Other cross-company governance is represented primarily by formal `reportsTo` and metadata workspace fields.

## Code Restoration Applied

- Restored `parentCompanyId` into DB schema, shared `Company`, server company selection, company create/update validation, and portability manifests.
- Added safe migration `0082_company_parent_hierarchy.sql` so clean installs receive the hierarchy column and live instances with the column already present can reconcile migration history.
- Added portability `issuePrefix` and `parentIssuePrefix` fields so future exports can carry company hierarchy instead of relying on hand wiring.

## Future Merge Rule

Never treat permissions as the full restore. A valid restore must verify all of these:

- Company parent links from `companies.parent_company_id`.
- Formal cross-company agent `reports_to` links.
- Agent metadata keys: `identity`, `runPolicy`, `workspace`, `relationshipWorkspace`, `serviceDiscoveryCache`, `deploymentAwareness`, `skills`, `access`, and `universalBuildProfile`.
- Agent permissions keys: `canCreateAgents`, `canDesignOrganizations`, `canGenerateSystemTopology`, `canManageDeploymentAssignments`, `canManageRelationshipTypes`, and `canManageServiceDiscovery`.
- Full-org UI receives `parentCompanyId` in company API payloads.
