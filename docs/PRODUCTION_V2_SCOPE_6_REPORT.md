# Scope 6 completion report

## Scope

`Scope 6 — Long-production manipulation and productivity`

## Status

`COMPLETE ON codex/production-v2-scopes-2-7 — READY FOR THE SCOPE 6 CHECKPOINT.`

Scope 6 makes a long desktop Production workable without replacing the stable
Production v2 geography or introducing a generic editing framework. The
approved Direction 2 remains the visual target: compact controls, dense but
legible rows, visible operational truth, and semantic state color.

## Product result

- The sticky Sequence toolbar owns Sequence/Timing, visible and total Part
  counts, Search/Jump, current issue count, and the primary Add action.
- Search finds script, Cast Role, selected Voice, and stable Part number.
  Draft, issue, missing-caption, and Cast-role filters combine without changing
  canonical sequence order.
- Filtered views keep the original Part number, suppress misleading insertion
  seams, and provide a clear empty state. Jump reveals the real Part and clears
  filters only when necessary.
- Shift selection now selects a contiguous range in the visible operator view.
  Bulk selection can move as one stable block to an exact sequence position,
  move to another Production, delete with confirmation, or clear.
- Block movement preserves the selected Parts' relative order, clamps the final
  legal starting position, and persists through the existing canonical reorder
  contract.
- `Cmd/Ctrl+K` opens the existing small Production command surface even before
  audio has been loaded. It searches Parts, Cast Roles, and Voices and retains
  the existing high-value commands.
- Production health is ordinary desktop Workbench work rather than another
  competing Sheet. The mobile Sheet wrapper remains unchanged.
- No virtualization was added. The filtering/order path is proven with 150
  Parts and the real browser corpus proves the complete 50-Part lower-bound
  workstation with every Part still present in canonical order.
- The Focus Bar was tightened to the approved Direction 2 hierarchy. Draft and
  issue truth remain visible in the sticky Sequence toolbar and row states, so
  redundant header badges do not crowd Cast, Preview, Mix & Export, or Add.

## Architecture and truth

`ProductionEditorCanvas` owns view filtering and reveal behavior while
`SequenceWorkspace` continues to render canonical Parts. Filtering never
mutates the Production and never renumbers the underlying Part order.

`moveSelectionToPosition` is a small pure ordering function. The existing
`useProductionActions` mutation path remains the only frontend reorder owner,
and the existing backend timeline/repository contract remains authoritative.
The repository now locks the ordered active rows using valid PostgreSQL
`ORDER BY ... FOR UPDATE` syntax before persisting the exact order.

The Draft creation path now preserves an explicitly supplied `cast_role_id`.
PostgreSQL UUID Cast Role values are normalized to API strings at the document
projection boundary, preventing JSON serialization failures without changing
domain identity.

## Information hierarchy and color grammar

Ordinary structure remains neutral and white. Blue marks active selection and
workbench focus. Green communicates ready/current truth. Amber communicates
Drafts, stale preview, and review-required issues. Red remains reserved for
failure and destructive confirmation. Cast identity colors remain identity
accents and are always paired with role/Voice text; they never communicate
health by themselves.

Operational facts are not muted away: Part number, Cast/Voice, exact route,
script, duration, Take state, captions, operation state, and spend remain
visible in the repeated row. Secondary explanations stay subordinate to the
facts instead of turning the workstation into undifferentiated black cards.

The new Search/Jump popover and exact-position dialog reuse Audio Studio's
local shadcn Popover, Input, Button, and Dialog primitives. The final shadcn
audit found no import, dependency, type, build, or component-ownership issue.

## Replaced paths made unreachable

- Desktop Production health no longer renders its Sheet presentation. The
  shared health content appears in Production Workbench. Mobile retains the
  existing Sheet because mobile is outside this redesign.
- Insertion seams cannot be used from a filtered sequence, avoiding ambiguous
  placement against hidden Parts.
- The old audio-dependent command shortcut guard no longer blocks `Cmd/Ctrl+K`.
- No second reorder state machine, search index, virtual list, or command
  framework was created.

## Real human product QA

Exploratory QA used the persistent Living QA Production
`test production of conversation`
(`05e19cd3-c2f6-4fa0-90c6-0159d11e3556`). It now contains 50 useful Parts:
the original six recorded conversational Speech Parts, one 1.4-second Silence,
and 43 realistic multi-paragraph Drafts. Eight Drafts retain the existing
`Jenna` Cast assignment. The linked Music Bed, existing Takes, captions,
historical spend, and provider facts remain intact.

The browser pass searched for a narrative detail, jumped to its exact Part,
combined Cast and issue filters, and confirmed all 50 Parts returned in stable
order after clearing. A Shift range selected five neighboring Parts. The block
was moved from positions 8–12 to positions 20–24, reloaded, and verified in the
same relative order. The selection bar remained above the global Player with a
two-pixel safety gap and no overlap.

`Cmd+K` opened with no audio prerequisite and returned both recorded Jenna
Speech Parts and Jenna Cast-role Drafts. The real page showed no horizontal
overflow at the exact 1488 × 1058 Direction 2 comparison viewport. Workstation
geometry remained Focus Bar 58 px and Canvas/Workbench height `100dvh - 58px`.

The approved Direction 2 source and final served screenshot were placed in one
same-viewport side-by-side comparison. The final implementation preserves the
reference's compact focus header, white editorial surface, column grammar,
dense repeated rows, semantic state accents, and visible operator facts. The
extra compact Cast reel and editable Music lane are intentional locked product
objects from Scope 5 rather than design drift.

No paid provider call was required. No mobile redesign or QA was performed.

## Verification

- React: 72 files, 232 tests passed.
- Python: 324 tests passed.
- Provider contracts: 31/31 passed.
- Render/destination contracts: 15/15 passed.
- Voice package and exact-routing contracts passed.
- Domain integrity: 11/11 passed against the persistent QA database.
- OpenAPI export/generation, TypeScript, and Vite production build passed.
- Focused search, ordering, exact-position dialog, and keyboard suites: 4 files,
  8 tests passed before full convergence.
- Real 50-Part browser QA and pure 150-Part deterministic-order coverage passed.
- `git diff --check` passed.
- shadcn component audit completed.

## Checkpoint boundary

`SCOPE 6 COMPLETE. NEXT IMPLEMENTATION TARGET: SCOPE 7 — MIX/EXPORT AND FINAL CONVERGENCE.`
