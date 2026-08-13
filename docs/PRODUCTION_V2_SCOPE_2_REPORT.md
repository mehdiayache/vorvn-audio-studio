# Scope 2 completion report

## Scope

`Scope 2 — Composer spatial system`

## Status

`COMPLETE ON codex/production-v2-scopes-2-7 — READY FOR THE SCOPE 2 CHECKPOINT.`

Scope 2 replaces the former four-step Composer presentation with one recording
workspace shared by inline Sequence insertion, Production Workbench, and the
standalone Speak surface. The founder-selected light Production ledger remains
the visual baseline. Scopes 3–7 are authorized but are not included in this
checkpoint.

## Product result

- A new Speech Part opens at its exact Sequence seam, including insertion
  before an existing Part and append after the final Part.
- New Take opens directly beneath the recorded Speech Part while the selected
  immutable Take remains visible above it.
- Expand moves the same live Draft into the 560 px Production Workbench through
  a portal; it does not create a second Composer controller or reset text.
- Return inline restores the same Draft to the same Sequence location.
- Standalone Speak uses the same core surface and complete option set.
- Recording Context keeps Voice/Cast, exact method and model, language, format,
  and destination visible as one factual summary.
- Script Workspace owns Original, Spoken, and Tagged versions; Copy and
  side-by-side Compare operate on plain, selectable text.
- Performance and Output are progressive disclosures rather than wizard steps.
- Save Draft and Generate remain in a fixed action row and remain available for
  a 20,000-character script.

## Architecture and ownership

`useComposerController` remains the sole owner of route, text, delivery,
output, estimate, paid confirmation, and recoverable Draft state.
`ProductionComposerSession` owns the persistent controller instance and portals
`ControlledComposerSurface` between inline and Workbench hosts.
`SequenceWorkspace` owns the exact inline anchor; `ProductionPage` owns only
the current spatial presentation and target elements. No backend, provider,
Job, Take-selection, persistence, legacy server, or database contract changed.

The previous Who/Words/Performance/Output side navigation was removed. It was a
presentation state machine that hid the actual recording context and duplicated
the operator's mental workflow.

## Design system and color grammar

The implementation translates the established UI VORVN foundation into React
and preserves Audio Studio's local shadcn primitives. Button, Dialog, Select,
Textarea, and existing Voice selection components were reused. shadcn was
queried before implementation and its final component audit was completed; no
new dependency or competing primitive was added.

Neutral raised surfaces carry ordinary editing. Green confirms a complete
recording context, amber identifies incomplete setup, blue remains active
selection/generation, and red is reserved for real failure. Factual text,
exact route, language, format, character count, estimate, preparation state,
and destination remain legible rather than globally muted.

## Real human product QA

Desktop QA used the persistent `test production of conversation` Production
(`05e19cd3-c2f6-4fa0-90c6-0159d11e3556`) at 1440 × 1024. The pass opened a
real insertion at position 3, wrote a realistic suspense performance, expanded
to Workbench, returned inline, reopened New Take for Part 2, and verified the
neighboring recorded Parts remained available for context. No paid provider
request was needed for this spatial scope and no persistent QA object was
deleted.

Human use found two defects that component assertions did not reveal:

1. The original zero-height insertion seam was covered by the neighboring
   Speech row during pointer hit testing. It now has a real 12 px interaction
   band; the final seam remains a clear `Add another Part` action.
2. Workbench initially exposed both Composer and Workbench close controls. The
   Workbench chrome is now the single close owner.

The final pass measured Canvas width 872 px, Workbench width 560 px, and one
close control. Inline opening scrolls the independent Canvas so the 720 px
Composer sits from y=116 to y=836; its action row and Generate button remain
inside the 1024 px viewport. Workbench keeps its action row pinned to the
viewport bottom. No mobile design or QA was performed, per the approved desktop
program boundary.

## Verification

- React: 61 files, 206 tests passed.
- Python: 323 tests passed.
- Provider contracts: 31/31 passed.
- Render/destination contracts: 15/15 passed.
- Voice package and exact routing contracts passed.
- Domain integrity: 11/11 passed.
- OpenAPI export/generation, TypeScript, and Vite production build passed.
- Focused Composer/Sequence suite: 9 files, 25 tests passed after the final
  interaction fixes.
- shadcn audit: imports, dependencies, TypeScript/build, and real browser use
  verified.

## Checkpoint boundary

`SCOPE 2 COMPLETE. NEXT IMPLEMENTATION TARGET: SCOPE 3 — PART WORKBENCH.`
