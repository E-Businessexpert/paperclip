# REVIEW.md — review contract for `E-Businessexpert/paperclip`

Read by Qodo's review agent and by anyone reviewing a change here. It is the repository's half of
the estate standard; the other half lives in `mgmt/estate/` and `infra/APP-DEPLOY-STANDARD.md`.

- **Repository:** `E-Businessexpert/paperclip` on **GitHub**
- **Primary language:** TypeScript
- **SonarQube project:** `github.e-businessexpert.paperclip` — <https://codequality.lab.internal/dashboard?id=github.e-businessexpert.paperclip>

## What a reviewer must check here

### Evidence, not status flags

A change is not proven by `up`, `healthy`, exit 0 or HTTP 200 — every one of those has lied in this
estate. Ask for a row count, a byte count, a checksum, a diff, or a negative control that actually
failed. **A green that cannot fail is not evidence.** If a test cannot distinguish a working change
from a broken one, it has not tested anything.

### Secrets

- No secret literal in any committed file — not in compose, not in `configs:`/`secrets:` `content:`
  blobs, not in CI definitions. Values belong in an `env_file` (0600, root-owned) with a vault
  reference recorded beside it.
- No secret on a command line. Anything in `argv` is visible in the host's process list.
- Generated passwords must be **human-readable** (`Word-Word-Word-NN`), and must not contain `$` —
  Compose interpolates it and CI then fails in a way that is easy to misread.

### Anything that deploys

- **No published app ports.** Traefik reaches services on the `edge` network. Where a port must be
  published it binds a mesh IP, never `0.0.0.0` — `ufw` does not filter Docker-published ports.
- **Volumes are pinned** with `external: true` and an explicit `name:`. An unpinned volume plus a
  renamed project silently mints an empty one while the app still answers 200.
- **Containers and stacks are `<name>-<org>`.** Vhosts use the *function*, never the product name.
- Deploy through **Portainer**, not the CLI.

### Correctness

- No unbounded query, loop or retry without a ceiling.
- Errors are handled or deliberately propagated — never swallowed.
- Anything reached over the network has a timeout.
- Concurrent writers to the same record have a stated conflict rule.

## What must never regress

<!-- Fill this in per repository. Examples: a public API shape, a migration that cannot be re-run,
     a credential path other systems read, an output format a downstream job parses. -->

- _(not yet recorded — add the invariants a reviewer would not otherwise know)_

## Sensitive paths

<!-- Paths where a change deserves a deeper look than its diff size suggests. -->

- _(not yet recorded)_

## Related repositories

<!-- Declared in Qodo under Repositories -> Relationships so cross-repo context has something to
     pull. Keep this list and that one in step. -->

- _(not yet recorded)_

---
*Generated 2026-09-05 from `mgmt/estate/sop/SOP-CODE-QUALITY-CENTRALISATION.md`. Edit freely — the
placeholders above are the point, not the boilerplate.*
