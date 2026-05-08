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

- The full organization view is a global route at `/full-structure`.
- The full organization icon belongs in the universal sidebar top bar, not under a company and not inside `AgentChatTR`.
- Company-prefixed `/FAM/full-structure` links should redirect to the global `/full-structure` route.
- Do not add `/chatrooms` or `AgentChatTR` as a fake container for the full organization link.
- Keep upstream's native company `OrgChart` page separate from the custom enterprise `FullStructure` page.
- Preserve enterprise relationship metadata and permission fields in shared/server agent types.
- Preserve database migration compatibility for previously-applied local migrations when upstream renumbers or replaces migration files.

## Previous Issues And Fixes

- Issue: upstream updates were claimed live while the fork was still behind `origin/master`.
  Fix: always record `HEAD...origin/master` before merging and after committing.
- Issue: full organization link was placed under a company route or chat-room section.
  Fix: use a raw React Router link to `/full-structure` in the sidebar top bar.
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
- `/:companyPrefix/full-structure` redirects to `/full-structure`.
- The sidebar full-org icon href is `/full-structure`.
- The sidebar does not contain `AgentChatTR`.
- The sidebar does not add a `/chatrooms` full-org link.
