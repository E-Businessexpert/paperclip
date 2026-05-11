# Enterprise Knowledge And Project Restore - 2026-05-11

Purpose: document the post-upstream-merge repair that restored company project packages, agent knowledge files, AgentChatTR room files, and easier AgentChatTR navigation.

## Backup

- Live backup created before data repair:
  `/paperclip/instances/default/data/backups/paperclip-20260511-033748.sql.gz`
- Live container at repair time:
  `paperclip-control-plane-runtime:2026-05-10-fd28221a`

## Audit Findings

- Live DB hierarchy was intact: 10 companies and 442 agents.
- Local package export had 9 company folders and was missing the `EBU` package.
- Old local Labs package used legacy prefix `EBUAAAA`; live DB uses `EBUAAA`.
- Local export had zero `projects/` packages across all companies.
- Local export had missing `CHATROOM.md` files in `FAM`, `EBUAA`, old Labs, and `MSG`.
- Local export had duplicate frontmatter and stale `reportsTo: none` in multiple agent `AGENTS.md` files.
- Live DB already had adapter type/config, runtime config, permissions, relationship workspace, service discovery cache, access metadata, and skill metadata on active agents.

## Local Package Repairs

The repeatable repair script is:

```bash
node scripts/enterprise/repair-enterprise-knowledge.mjs \
  --live-json <sanitized-live-export.json> \
  --export-root "C:\Users\savem\Documents\New project\paperclip-live-export"
```

It repairs local company packages by:

- Creating the missing `EBU` company package from sanitized live data.
- Normalizing legacy Labs prefix from `EBUAAAA` to live prefix `EBUAAA`.
- Creating project packages for all live projects plus required enterprise operating projects.
- Creating missing `CHATROOM.md`, `KNOWLEDGE.md`, and `RELATIONSHIPS.md` files.
- Normalizing only stale or duplicate-frontmatter `AGENTS.md` files.
- Preserving existing `CHATROOM.md` files instead of overwriting them.

Post-repair local package verification:

- `COR`: 32 agents, 5 projects, 21 skills.
- `EBU`: 47 agents, 8 projects, 1392 skills.
- `EBUA`: 46 agents, 5 projects, 30 skills.
- `EBUAA`: 68 agents, 3 projects, 40 skills.
- `EBUAAA`: 108 agents, 9 projects, 68 skills.
- `ECO`: 33 agents, 4 projects, 20 skills.
- `FAM`: 6 agents, 3 projects, 7 skills.
- `MSG`: 40 agents, 7 projects, 24 skills.
- `OPS`: 31 agents, 3 projects, 15 skills.
- `REA`: 31 agents, 3 projects, 15 skills.

All repaired packages had:

- zero missing `CHATROOM.md`
- zero missing `KNOWLEDGE.md`
- zero missing `RELATIONSHIPS.md`
- zero stale `reportsTo: none`
- zero duplicate frontmatter blocks

## Live Repairs

The live DB/file repair was idempotent:

- Inserted 32 missing project rows.
- Created 87 missing managed `CHATROOM.md` files.
- Created 442 managed `KNOWLEDGE.md` files.
- Created 442 managed `RELATIONSHIPS.md` files.

Final live project counts:

- `COR`: 5
- `EBU`: 8
- `EBUA`: 5
- `EBUAA`: 3
- `EBUAAA`: 9
- `ECO`: 4
- `FAM`: 3
- `MSG`: 7
- `OPS`: 3
- `REA`: 3

## UI Repair

AgentChatTR was simplified so agents do not land in a three-frame wall of panels:

- The active chat remains the main working surface.
- Agent directory is hidden by default and available through `Show directory`.
- Context, workflow packs, relationship links, and board routing are hidden by default and available through `Show context`.
- The search bar opens the directory automatically when used.
- Global AgentChatTR and company AgentChatTR remain separate routes.

## Future Merge Guardrails

- Do not merge AgentChatTR and Full Org Chart; they are separate functions.
- Do not replace local enterprise package files with upstream defaults.
- Preserve `parentCompanyId`, formal cross-company `reportsTo`, relationship metadata, permissions, service discovery cache, and managed instruction files.
- Preserve `CHATROOM.md`, `KNOWLEDGE.md`, and `RELATIONSHIPS.md` as managed agent knowledge files.
- If Labs prefix appears as `EBUAAAA` in an old export, normalize to live DB prefix `EBUAAA` before import.
- Do not overwrite existing `CHATROOM.md` content during repair; only create missing files.
