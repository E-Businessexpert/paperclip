# Upstream Sync Assessment - 2026-05-02

## Baseline

- Local deployment branch: `codex/cross-company-hierarchy-qa`
- Current custom head: `fcd355ba`
- Original upstream: `origin/master`
- Original upstream head: `76f09c8e`
- Merge base: `b649bd45`
- Latest stable upstream tags observed: `v2026.428.0`, `v2026.427.0`, `v2026.416.0`

## Update Size

- Upstream commits since merge base: 149
- Custom commits since merge base: 48
- Upstream files changed: 984
- Custom files changed: 78
- Files changed on both sides: 59

This is not a safe fast-forward update. It requires an integration branch and manual conflict resolution.

## Major Upstream Areas Changed

- UI: sidebar, workspace switcher, issue UI, routine run tab, company rail, company routing, OrgChart-adjacent surfaces.
- Server: auth, route registration, agents, adapters, activity, plugin host services, board access, backups.
- Database: migrations `0056` through `0074`, environment tables, plugin database namespaces, issue thread interactions, liveness/watchdog tables.
- Shared types and validators: activity, company, agent, validator exports.
- Skills and adapters: company creator, create-agent-adapter, paperclip skills, local adapter/runtime support.
- Deployment/tooling: Dockerfile, package scripts, lockfile, AWS/ECS docs and config.

## Dry Merge Result

`git merge-tree --write-tree --messages HEAD origin/master` reports content conflicts.

High-risk conflicts include:

- `Dockerfile`
- `packages/db/src/client.test.ts`
- `packages/db/src/migrations/meta/_journal.json`
- `packages/shared/src/types/activity.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/validators/company.ts`
- `packages/shared/src/validators/index.ts`
- `server/src/app.ts`
- `server/src/index.ts`
- `server/src/middleware/auth.ts`
- `server/src/routes/activity.ts`
- `server/src/routes/adapters.ts`
- `server/src/routes/agents.ts`
- `server/src/routes/authz.ts`
- `server/src/services/activity-log.ts`
- `server/src/services/agents.ts`
- `server/src/services/board-auth.ts`
- `server/src/services/plugin-host-services.ts`
- `server/src/types/express.d.ts`
- `ui/src/App.tsx`
- `ui/src/api/activity.ts`
- `ui/src/components/CompanyRail.tsx`
- `ui/src/components/SidebarAgents.tsx`
- `ui/src/lib/company-routes.test.ts`
- `ui/src/lib/company-routes.ts`
- `ui/src/pages/OrgChart.tsx`

## Custom Work To Protect

- Full-structure fixed viewport and direct wheel zoom.
- Top filter/color-key toolbar behavior.
- Company filter menu visibility and `COR` prefix display.
- Reset/collapse/expand behavior and persisted user collapse state.
- FAM/COR hierarchy and company graph wiring.
- Adapter, skills, permissions, metadata, and company-level hierarchy extensions.
- Live deployment scripts and runtime image flow.

## Responsible Ownership

Company: `E-Business Expert Labs LLC`

Project folder:

`E-Business Expert Labs LLC / Paperclip Control Plane / Upstream Sync & Release Program`

Responsible agents:

- `Paperclip Upgrade Steward`: owns upstream fetch, comparison, integration branch, and merge strategy.
- `Adapter & Skills Review Agent`: reviews adapter runtime changes, skill injection, company skills, prompts, and model profiles.
- `DB Migration Guardian`: owns backup, export, migration ordering, journal resolution, and rollback safety.
- `Hierarchy Integrity QA Agent`: verifies FAM, COR, company tree, parent relationships, cross-company links, and agent wiring.
- `Full Structure UI QA Agent`: verifies filters, color key, graph, zoom, reset, collapse, layout, and scroll behavior.
- `Deployment Controller`: builds image, recreates container safely, health-checks, smoke-tests, and maintains rollback image.

## Recommended Next Step

Create an integration branch from `fcd355ba`, merge `origin/master`, resolve conflicts in batches, and run verification before deployment.

Suggested branch:

`codex/upstream-sync-2026-05-02`

Verification gate:

- DB backup and hierarchy export before any live migration.
- `pnpm --filter @paperclipai/ui typecheck`
- `pnpm --filter @paperclipai/ui build`
- Server/package typecheck and focused tests for auth, agents, adapters, companies, backups, and activity routes.
- DB migration dry-run/review, especially migration journal `0056` through `0074`.
- Live-like `/FAM/full-structure` smoke test with explicit checks for `COR`, reset, collapse, graph zoom, no page scroll, and no console/network errors.

