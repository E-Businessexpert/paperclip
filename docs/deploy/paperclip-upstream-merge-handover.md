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

## Local Customizations To Preserve

- The full organization view supports both `/full-structure` and company-scoped routes like `/FAM/full-structure`.
- The full organization UI must preserve the pre-upstream-merge enterprise chart experience from commit `956a811c`: compact sticky top filters, color key, wheel zoom, expand/collapse controls, graph fullscreen, and minimized Wiring Inspector.
- `AgentChatTR` is a separate feature at `/chatrooms`; do not use it as a container for the full organization chart.
- The sidebar should expose `Full Org Chart` and `AgentChatTR` as separate links/functions.
- The full organization icon belongs in the universal sidebar top bar and may link to the global `/full-structure` route.
- Company-prefixed `/FAM/full-structure` links must render the full-structure page in the company context; do not redirect them away to the global route.
- Do not add `/chatrooms` as a fake container for the full organization link.
- Do not turn `AgentChatTR` into a page that dumps every agent; it is a lightweight sidebar section for the full-org entry point unless a dedicated chatroom feature is restored intentionally.
- Keep upstream's native company `OrgChart` page separate from the custom enterprise `FullStructure` page.
- Preserve enterprise relationship metadata and permission fields in shared/server agent types.
- Preserve database migration compatibility for previously-applied local migrations when upstream renumbers or replaces migration files.

## Previous Issues And Fixes

- Issue: upstream updates were claimed live while the fork was still behind `origin/master`.
  Fix: always record `HEAD...origin/master` before merging and after committing.
- Issue: full organization link was made global-only and then incorrectly nested under the visible `AgentChatTR` menu.
  Fix: keep the raw React Router icon link to `/full-structure` in the sidebar top bar, expose a separate prefix-aware `Full Org Chart` link, and keep `AgentChatTR` as its own `/chatrooms` link.
- Issue: full organization chart UI was replaced with the wrong standalone corporation map and was mixed into the `AgentChatTR` sidebar section.
  Fix: restore the old `956a811c` enterprise org-chart UI as the full-structure page, keep upstream's native company `OrgChart` separate, and restore `AgentChatTR` as `/chatrooms`.
- Issue: native upstream org-chart code was overwritten by the custom enterprise graph.
  Fix: keep `ui/src/pages/OrgChart.tsx` as upstream's company chart and keep `ui/src/pages/FullStructure.tsx` as the custom enterprise graph.
- Issue: deployment recovery could restart an old image after reboot.
  Fix: update Portainer stack and host recovery compose files to the same image tag.
- Issue: migration numbering collided with upstream migrations.
  Fix: keep upstream migration numbering and preserve live-db compatibility in migration loading logic instead of keeping duplicate numbered local migrations.

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
pnpm exec vitest run --project @paperclipai/ui ui/src/components/Sidebar.test.tsx ui/src/lib/company-routes.test.ts ui/src/pages/FullStructure.test.ts --reporter=verbose
```

Expected route/link behavior:

- `/full-structure` renders the global full organization chart.
- `/:companyPrefix/full-structure` renders the full-structure page in company context and scopes the graph to that connected company graph.
- The sidebar full-org icon href is `/full-structure`.
- The sidebar contains separate `Full Org Chart` and `AgentChatTR` links.
- `AgentChatTR` resolves to the company-scoped `/chatrooms` board route.
- The sidebar does not place the full organization chart inside the `AgentChatTR` section.
