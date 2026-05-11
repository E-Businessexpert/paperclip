# Paperclip Upstream Merge Handover

This note exists to prevent future upstream updates from breaking E-Business Expert's live Paperclip customizations.

## Remotes

- `origin` is the original Paperclip repository: `https://github.com/paperclipai/paperclip.git`.
- `userfork` is the E-Business Expert deployment repository: `https://github.com/E-Businessexpert/paperclip.git`.

Always compare both before an update:

```bash
git fetch origin userfork
git rev-list --left-right --count HEAD...origin/master
git rev-list --left-right --count HEAD...userfork/master
```

## Required Update Flow

1. Create a backup branch from the current deployed fork before merging upstream.
2. Export or backup the live database before any migration-bearing deploy.
3. Merge `origin/master` into the deployment branch.
4. Resolve conflicts by keeping upstream product updates and explicitly preserving local enterprise extensions.
5. Run the validation checklist below before commit, push, image build, or Portainer deployment.
6. When deploying a new image tag, update both Portainer stack configuration and the host recovery compose files so reboot/recovery cannot roll back to an old image.
7. Keep the Dockerfile compatible with the live VM's legacy Docker builder; do not depend on BuildKit-only glob behavior for dependency-cache `COPY` steps.

## Local Customizations To Preserve

- The full organization view supports both `/full-structure` and company-scoped routes like `/FAM/full-structure`.
- The full organization UI must preserve the pre-upstream-merge enterprise chart experience from commit `956a811c`: compact sticky top filters, color key, wheel zoom, expand/collapse controls, graph fullscreen, and minimized Wiring Inspector.
- `AgentChatTR` is a separate feature; do not use it as a container for the full organization chart.
- The global AgentChatTR route is `/chatrooms` and is for CEO/trust-owner communication across every visible agent.
- The company AgentChatTR route is `/:companyPrefix/chatrooms` and must stay scoped to the selected company's agents plus explicitly linked cross-company contacts.
- The sidebar should expose `Full Org Chart`, `Global AgentChatTR`, and company `AgentChatTR` as separate links/functions.
- The full organization icon belongs in the universal sidebar top bar and must link to the global `/full-structure` route.
- The global AgentChatTR icon belongs in the same universal sidebar top bar and must link to the global `/chatrooms` route.
- Company-prefixed `/FAM/full-structure` links must render the full-structure page in the company context and seed the selected company, but the visible graph is still the family-wide enterprise structure.
- Company-specific org charts belong on `/:companyPrefix/org`; do not turn `/full-structure` into a single-company page.
- Do not add `/chatrooms` as a fake container for the full organization link.
- Do not make company `AgentChatTR` dump every agent; only the global `/chatrooms` route may list every visible company agent.
- Keep upstream's native company `OrgChart` page separate from the custom enterprise `FullStructure` page.
- Do not route the legacy `FullStructureCorporationMapPage`; it is the wrong standalone corporation map that previously replaced the interactive enterprise org chart.
- Preserve enterprise relationship metadata and permission fields in shared/server agent types.
- Preserve company `parentCompanyId` from the database through shared types, server company responses, portability manifests, and the full-org graph. The live DB column is `companies.parent_company_id`.
- Preserve legacy live enterprise relationship keys `budgetFundedBy`, `mustInform`, and `statusReportedTo`; they are still present in live metadata and must remain resolvable after upstream taxonomy updates.
- Preserve the agent detail `Agent Permissions` page and dashboard context panels: they must expose relationship workspace editing, cross-company target search, expanded permission toggles, service discovery/software assignments, adapter config, runtime config, and redacted metadata.
- Preserve database migration compatibility for previously-applied local migrations when upstream renumbers or replaces migration files.
- Preserve the live portable export at `C:\Users\savem\Documents\New project\paperclip-live-export` as the restore source for company packages, agent instructions, `.paperclip.yaml` metadata, permissions, service-discovery cache, and relationship links.
- Preserve the enterprise knowledge/project repair documented in `docs/deploy/enterprise-knowledge-project-restore-2026-05-11.md`; future updates must keep project packages, `CHATROOM.md`, `KNOWLEDGE.md`, and `RELATIONSHIPS.md` aligned with live data.
- Preserve the Dual Memory implementation documented in `docs/deploy/dual-memory-paperclip-handover-2026-05-11.md`: Hindsight lifecycle payload enrichment, `paperclip.dual-memory` plugin, Mem0-compatible tools, local fallback memory, and Labs governance ownership.

## Previous Issues And Fixes

- Issue: upstream updates were claimed live while the fork was still behind `origin/master`.
  Fix: always record `HEAD...origin/master` before merging and after committing.
- Issue: full organization link was made global-only and then incorrectly nested under the visible `AgentChatTR` menu.
  Fix: keep the raw React Router icon link to `/full-structure` in the sidebar top bar, expose a separate prefix-aware `Full Org Chart` link, and keep `AgentChatTR` as its own `/chatrooms` link.
- Issue: full organization chart UI was replaced with the wrong standalone corporation map and was mixed into the `AgentChatTR` sidebar section.
  Fix: restore the old `956a811c` enterprise org-chart UI as the full-structure page, keep upstream's native company `OrgChart` separate, and restore `AgentChatTR` as `/chatrooms`.
- Issue: `/chatrooms` redirected into the selected company, so there was no true global CEO/trust-owner chat board.
  Fix: route `/chatrooms` to `AgentChatTR scope="global"` and route `/:companyPrefix/chatrooms` to `AgentChatTR scope="company"`.
- Issue: Company Environments looked blank when the experimental flag was disabled.
  Fix: render explicit loading/error/disabled states and provide a direct "Enable Environments" action from the company environments page.
- Issue: data customizations appeared to vanish after an upstream merge.
  Fix: audit the code first, then restore data from `paperclip-live-export` or a timestamped `paperclip-live-snapshots` backup instead of recreating permissions and relationships by hand.
- Issue: live relationship metadata existed but the graph returned zero secondary relationship links because upstream only recognized new snake_case relationship keys.
  Fix: keep compatibility aliases for the live camelCase keys in `packages/shared/src/types/agent.ts`.
- Issue: the upstream merge kept relationship data on the API but removed the visible agent detail controls and type contract, making the agent dashboard look like relationships, metadata, service discovery, and advanced permissions had disappeared.
  Fix: keep `AgentDetail.enterpriseRelationships` in the shared type, keep the `Agent Permissions` tab, and run `ui/src/pages/AgentDetailEnterprise.test.tsx` with each upstream merge.
- Issue: the live DB still had company hierarchy in `companies.parent_company_id`, but the merged repo no longer had the field in schema/shared/server selection, so the API and full-org UI could lose company-to-company links.
  Fix: keep migration `0082_company_parent_hierarchy`, `Company.parentCompanyId`, `companyService.companySelection.parentCompanyId`, and portability `issuePrefix`/`parentIssuePrefix` support.
- Issue: native upstream org-chart code was overwritten by the custom enterprise graph.
  Fix: keep `ui/src/pages/OrgChart.tsx` as upstream's company chart and keep `ui/src/pages/FullStructure.tsx` as the custom enterprise graph.
- Issue: the restored full-org UI was present but not protected by an interaction-level test, so filter placement, wheel zoom, reset, collapse, and card detail regressions could slip through a future merge.
  Fix: keep `ui/src/pages/FullStructureEnterpriseOrgChart.test.tsx` in the focused preservation suite.
- Issue: deployment recovery could restart an old image after reboot.
  Fix: update Portainer stack and host recovery compose files to the same image tag.
- Issue: migration numbering collided with upstream migrations.
  Fix: keep upstream migration numbering and preserve live-db compatibility in migration loading logic instead of keeping duplicate numbered local migrations.
- Issue: Portainer tar-context uploads can fail before stack update with stream copy errors.
  Fix: if the stack was not updated, deploy through the VM SSH fallback: build the base image from the pushed Git commit on `ubuntu@10.0.15.5`, build the runtime wrapper in `/srv/apps/stacks/paperclip-deploy`, update both `compose.yaml` and `recovery.override.yaml`, then restart with `docker compose`.
- Issue: the live VM Docker builder does not reliably handle `COPY --parents` wildcard paths.
  Fix: use explicit package paths for current workspace dependency-cache copies, such as `packages/plugins/sandbox-providers/e2b/package.json`.
- Issue: local company package knowledge drifted after the upstream merge: missing `EBU`, stale Labs prefix `EBUAAAA`, zero project packages, missing chatrooms, stale `reportsTo: none`, and duplicate agent frontmatter.
  Fix: run `scripts/enterprise/repair-enterprise-knowledge.mjs` with a sanitized live export, normalize Labs to `EBUAAA`, create project packages, create missing `CHATROOM.md`/`KNOWLEDGE.md`/`RELATIONSHIPS.md`, and only normalize stale/duplicate `AGENTS.md` files.

## Validation Checklist

Run these before committing an upstream merge:

```bash
git diff --name-only --diff-filter=U
git diff --check
git diff --cached --check
pnpm --filter @paperclipai/shared typecheck
pnpm --filter @paperclipai/db typecheck
pnpm --filter @paperclipai/server typecheck
pnpm --filter @paperclipai/ui build
pnpm --filter @paperclipai/plugin-dual-memory test
pnpm --filter @paperclipai/plugin-dual-memory typecheck
pnpm --filter @paperclipai/plugin-dual-memory build
pnpm exec vitest run --project @paperclipai/ui ui/src/components/Sidebar.test.tsx ui/src/components/SidebarCompanyMenu.test.tsx ui/src/lib/company-routes.test.ts ui/src/pages/FullStructure.test.ts ui/src/pages/FullStructurePage.test.tsx ui/src/pages/FullStructureEnterpriseOrgChart.test.tsx ui/src/pages/AgentChatTR.test.tsx ui/src/pages/AgentDetailEnterprise.test.tsx ui/src/pages/CompanySettings.test.tsx --reporter=verbose
pnpm --filter @paperclipai/server test -- company-portability
```

Expected route/link behavior:

- `/full-structure` renders the global full organization chart.
- `/:companyPrefix/full-structure` renders the same family-wide full organization chart while seeding that company as the route context.
- `/:companyPrefix/org` renders the company-only native org chart.
- The sidebar full-org icon href is `/full-structure`.
- The sidebar global AgentChatTR icon href is `/chatrooms`.
- The sidebar contains separate full-org, global AgentChatTR, and company AgentChatTR links.
- `/chatrooms` resolves to global AgentChatTR and seeds the family/trust company when available.
- `/:companyPrefix/chatrooms` resolves to the company-scoped AgentChatTR board route.
- The sidebar does not place the full organization chart inside the `AgentChatTR` section.
- The full-org chart keeps compact sticky top filters, the company/line color key, mouse-wheel graph zoom, per-node collapse/expand, reset-to-uncollapsed behavior, card-detail toggles, graph fullscreen, and minimized Wiring Inspector.
- The full-org color key must include Cornerstone and every visible company returned by the family enterprise graph.
- Dual Memory `memory-self-test` must prove save/search works through the plugin worker; do not accept a UI-only memory check.

Expected live hierarchy data:

- `FAM` has no parent.
- `COR` parent is `FAM`.
- `EBUAA`, `EBUAAA`, `MSG`, `OPS`, and `REA` parent is `COR`.
- `EBUA` parent is `EBUAA`.
- `EBU` and `ECO` parent is `EBUA`.
- Formal cross-company `reportsTo` links should include `COR -> FAM`, `EBUAA -> COR`, `EBUAAA -> COR`, `MSG -> COR`, `OPS -> COR`, `REA -> COR`, `EBUA -> EBUAA`, and `EBU/ECO -> EBUA`.
- Live metadata should keep adapter type/config, runtime config, permissions, service-discovery cache, relationship workspace, identity, run policy, and skill metadata on every active enterprise agent.
