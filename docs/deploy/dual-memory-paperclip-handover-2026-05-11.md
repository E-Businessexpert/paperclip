# Dual Memory Paperclip Handover - 2026-05-11

Purpose: add real operational and personalization memory to Paperclip while preserving E-Business Expert enterprise customizations during upstream updates.

## Upstream Update Context

Before this work, the E-Business Expert fork was behind the original Paperclip upstream by 12 commits. The upstream set included Cursor Cloud, LLM Wiki host support, Daytona sandbox provider, secrets provider vault/import work, environment messaging, release verification hardening, Drizzle update, and sidebar section controls.

During merge, preserve local enterprise migration `0082_company_parent_hierarchy.sql`. Upstream migrations were shifted to `0083_dry_vision.sql` and `0084_company_secret_provider_configs.sql` to avoid colliding with live migration history.

## Memory Architecture

- Operational layer: install/configure `@vectorize-io/hindsight-paperclip` separately. Paperclip now enriches `agent.run.started` and `agent.run.finished` events with issue title, description, status, project/task ids, output/result, and run timestamps so Hindsight has useful payloads.
- Personalization layer: bundled plugin `@paperclipai/plugin-dual-memory` registers Mem0-compatible tools for long-term user preferences, permanent facts, and style guides.
- Local fallback: the Dual Memory plugin stores personalization memories in Paperclip plugin entities when Mem0 credentials are absent or remote calls fail.
- Hindsight fallback visibility: the Dual Memory plugin also records recent run lifecycle payloads as local operational run-memory entities so operators can verify lifecycle capture without relying only on an external service.

## Plugin Package

- Package: `packages/plugins/paperclip-plugin-dual-memory`
- Manifest id: `paperclip.dual-memory`
- UI route: plugin page route `memory`
- Tools:
  - `mem0_search_user_memory`
  - `mem0_save_user_memory`
  - `mem0_list_user_memory`
  - `mem0_delete_user_memory`
- Action:
  - `memory-self-test`
- Data:
  - `memory-health`

The plugin intentionally calls Mem0-compatible HTTP endpoints directly instead of depending on the `mem0ai` npm package. The npm package currently pulls native SQLite dependencies that can fail on Windows/Node 26 build hosts.

## Environment Variables

- `HINDSIGHT_API_KEY`: external Hindsight API key used by the official Hindsight plugin.
- `MEM0_API_KEY`: Mem0 API key, used when no Paperclip secret reference is configured.
- `PAPERCLIP_USER_ID`: stable user id for personalization memory, defaulting to `paperclip-owner` if absent.

Prefer storing `MEM0_API_KEY` as a Paperclip secret and configuring the plugin with `mem0ApiKeyRef`.

## Responsible Labs Ownership

- Company: E-Business Expert Labs LLC (`EBUAAA`)
- Team lane: Paperclip control-plane/runtime governance
- Project: `Dual-Layer Memory Platform`
- Source/update project: `Upstream Merge and Release Governance`
- Responsible agents:
  - `Paperclip Source Sync Lead`
  - `Paperclip Runtime and Adapter Configuration Lead`
  - `Paperclip Project Manager`
  - `AgentChatTR Project Manager`
  - `Dual Memory Steward`

Apply or repair these records with:

```bash
DATABASE_URL=<live-db-url> pnpm exec tsx scripts/enterprise/apply-labs-dual-memory-governance.ts --apply
```

Dry-run first by omitting `--apply`.

## Functional Verification

Required local checks:

```bash
pnpm --filter @paperclipai/plugin-dual-memory test
pnpm --filter @paperclipai/plugin-dual-memory typecheck
pnpm --filter @paperclipai/plugin-dual-memory build
pnpm --filter @paperclipai/server typecheck
pnpm --filter @paperclipai/ui build
```

Required live checks:

- The Dual Memory plugin installs and reports healthy.
- `memory-self-test` returns `ok: true`; this proves save and search are wired.
- A local fallback personalization memory is persisted and returned by search.
- `agent.run.started` and `agent.run.finished` events include issue/task/output payload fields for Hindsight.
- Recent run lifecycle payloads appear in Dual Memory `memory-health` under operational run memory.
- If Mem0 credentials are configured, save and search succeed against Mem0. If not, the local fallback still works.

## Future Merge Guardrails

- Do not remove `paperclip.dual-memory` from Docker build/package copy steps.
- Do not add native Mem0 dependencies unless the Windows and live Docker builders are verified.
- Do not claim memory is working from UI render alone. Always run tool/action verification.
- Preserve `server/src/services/heartbeat.ts` lifecycle payload enrichment; Hindsight needs issue/output context.
- Preserve enterprise org chart, AgentChatTR, agent dashboard permissions, relationship workspace, service discovery, metadata, and company hierarchy during upstream updates.
