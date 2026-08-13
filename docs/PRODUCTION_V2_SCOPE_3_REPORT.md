# Scope 3 completion report

## Scope

`Scope 3 — Part Workbench`

## Status

`COMPLETE ON codex/production-v2-scopes-2-7 — READY FOR THE SCOPE 3 CHECKPOINT.`

Scope 3 replaces the former desktop Part Inspector presentation with an exact,
type-aware Production Workbench. It preserves the founder-selected light
Production ledger and the styling baseline verified after Scope 2. No mobile
redesign is included.

## Product result

- Speech and Draft Parts open into Text, Takes, Captions, and Details sections.
- The Text section presents the canonical Part script and exactly one immutable
  selected-Take wording version: Original, Spoken, Tagged, or Unknown.
- The selected wording has an explicit `used` marker, Copy, Compare, and a
  Provider returned disclosure only when returned text differs.
- The Takes section is a creative performance stack with stable Part-local Take
  ordinals, clear selected truth, input wording state, play, compare, and Use in
  mix actions.
- New Take remains an available secondary creative action instead of replacing
  the selected result or dominating the Workbench.
- Details exposes the selected Take's exact immutable Voice, provider, region,
  model, tier, recording method, capability, language, format, identity and
  binding references, and accounting. Provider-attempt evidence is progressive
  disclosure.
- Silence and linked-asset views are type-specific and do not invent Voice,
  Take, caption, provider, or spend facts.
- Silence now has a direct visible Workbench entry. Exact duration remains
  visible as `1.4 seconds` rather than being rounded to a clock label.
- `part` and `section` URL parameters restore the exact Part and Workbench
  section after reload while preserving unrelated query context.

## Truth and architecture

The selected Take snapshot remains the authority for recorded Voice and input
wording facts. `selected_take_text_state` is normalized as Raw → Original,
Shaped → Spoken, and Tagged → Tagged. Unknown historical truth is labelled or
omitted; populated text fields are never used to guess state.

Alternative Take responses now project their existing immutable `text_state`
through the owned timeline contract and generated OpenAPI type. Stable Take
ordinals are derived from deterministic creation time plus Take ID order, not
from the current UI list position. No provider result, generation semantics,
Job state machine, or backend generation field was duplicated.

Presentation remains split across the Part Workbench shell and focused Text,
Takes, Captions, and Details panels. The reusable Take card gained only the
selected/Input-state facts needed by the Workbench. `ProductionPage` owns URL
and spatial state; it does not take ownership of immutable Part truth.

## Information hierarchy and color grammar

The Workbench follows the approved structured editorial direction. The script
or selected performance is primary; creative actions and revision context are
secondary; provider evidence is tertiary disclosure. Ordinary surfaces stay
neutral. Blue denotes active selection/used information, while green, amber,
and red retain success, attention, and failure semantics. A real implementation
defect using nonexistent data-series and shadow token names was corrected to
the owned VORVN semantic token vocabulary.

shadcn Tabs, Dialog, and Scroll Area composition was inspected before the
implementation. Existing local Tabs, Dialog, Button, and disclosure patterns
were reused. The final shadcn audit confirmed imports, installed dependencies,
TypeScript/build health, and real-browser interaction; no duplicate generic
primitive or new dependency was added.

## Replaced paths made unreachable

- The old Text panel that stacked Raw, Spoken, and Tagged snapshots equally was
  deleted from the rendered path.
- The old generic Script presentation was replaced by canonical Part script +
  one selected immutable Take wording.
- The old Silence row with no direct Workbench entry is unreachable; Silence
  now opens its exact Timing/Details view from the Sequence.
- Generic speech-only concepts are no longer rendered for Silence or linked
  assets.

No separate obsolete inspector component remains to preserve the replaced
presentation.

## Real human product QA

Desktop exploratory QA used the persistent `test production of conversation`
Production (`05e19cd3-c2f6-4fa0-90c6-0159d11e3556`) at the primary 1440 px
working width.

The pass opened Text, Takes, and Details for real neighboring Speech Parts;
opened Compare; played and paused a Take; changed Part 2 from selected Take 2 to
Take 3 and restored Take 2; inspected alternative Original and Tagged immutable
input states; expanded Technical evidence; reloaded an exact Takes deep link;
and confirmed the same Part/section returned.

A deliberate 1.4-second Silence was added at final position and retained as
useful Living QA state. Manual use exposed that Silence lacked a direct details
entry and that its Workbench duration was too coarsely formatted. Both defects
were fixed and the final served application showed `Part 07 · Silence`, only
Timing and Details tabs, exact `1.4 seconds`, and an explicit explanation that
speech-only concepts do not apply. No paid provider call was needed.

No mobile design or QA was performed, per the approved desktop boundary.

## Verification

- React: 63 files, 211 tests passed.
- Python: 323 tests passed on the final clean rerun.
- Provider contracts: 31/31 passed.
- Render/destination contracts: 15/15 passed.
- Voice package and exact-routing contracts passed.
- Domain integrity: 11/11 passed.
- OpenAPI export/generation, TypeScript, and Vite production build passed.
- Focused inspector, Take, Silence, and format suites passed.
- `git diff --check` passed.
- shadcn component audit completed.

One first full Python run encountered a shared-database stale-Job count left by
the persistent runtime. The isolated test passed, and the complete final rerun
then passed all 323 tests. This was not hidden or treated as a product failure.

## Checkpoint boundary

`SCOPE 3 COMPLETE. NEXT IMPLEMENTATION TARGET: SCOPE 4 — CAPTIONS + FLOATING TRANSPORT.`
