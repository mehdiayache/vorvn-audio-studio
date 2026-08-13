# Scope 1 completion report

## Scope

`Scope 1 — Canonical Speech Part`

## Status

`COMPLETE ON codex/production-v2-scope-1 — OPTION 2 IMPLEMENTED AND VERIFIED.`

The founder-selected option 2 is now the binding presentation: one light,
continuous production ledger with stable order, Voice/method, and
script/result columns. Scope 1 is complete on its branch and is not merged by
this report. Scope 2 remains unauthorized and unstarted.

## Tested checkpoints

- `7664b00` — redesign Speech Parts as the Production ledger.
- `3fe78a6` — preserve explicit alternative-Take non-selection through the
  application service and repository boundary.
- Final layout, totals, design-QA evidence, and this report are included in the
  final branch checkpoint following this report.

## Final product result

The Speech Part is now the dominant repeated Production object rather than a
stack of generic dark cards. At desktop widths, the sequence uses a centered
1200 px ledger with a 48 px order column, 190 px Voice/method column, and a
flexible script/result column. The anatomy remains stable while independent
states combine:

- visible reorder grip and edit affordance;
- selected immutable Take Voice, exact model/tier, capability, and language;
- authored script with measured long-text expansion;
- playback, actual waveform, duration, stable Take ordinal, immutable input
  state, captions, and historical Part spend;
- contextual alternatives and Take review without making New Take the primary
  everyday action;
- compact durable-operation truth without replacing the card anatomy;
- distinct identity, active/generating, playing, ready/caption, review/warning,
  failure, Workbench-active, and bulk-selection grammar.

The bottom summary exposes the duration and spend of the Parts visible in the
sequence. Music Bed and later Production controls were not redesigned.

## Design system and component discipline

The implementation translates the established UI VORVN foundation into React
and continues to use Audio Studio's semantic tokens and local shadcn
primitives. Existing Button, Checkbox, Dropdown Menu, Progress, Tabs, and
Tooltip ownership was reused; no duplicate primitive or dependency was added.

Ordinary state uses neutral raised surfaces. Identity uses stable semantic data
series. Blue means active/generating, violet means playing, green means ready
or caption-complete, amber means review/warning, and red is reserved for true
failure. Facts such as Original, Spoken, Tagged, captions, and spend remain
legible instead of being globally muted.

The visual target, two-pass comparison, responsive measurements, intentional
differences, and real-QA record are documented in `design-qa.md`.

## Approved precision corrections preserved

1. `GenerateResult` was not reimplemented. Frontend/OpenAPI typing aligns with
   the runtime's existing `part_id`, `take_id`, and `duration_ms` result.
2. The explicit `select_result` contract remains authoritative. Generate
   Alternative submits non-selection intentionally; explicit replacement
   workflows may still select.
3. `selected_take_number` is a stable Part-local creation ordinal ordered by
   `(created_at, Take ID)` ascending, never a UI list index.
4. Selected input state comes only from immutable Take `text_state`:
   `raw → Original`, `shaped → Spoken`, `tagged → Tagged`; unknown history is
   not guessed.
5. A recorded Part's always-visible Voice/method facts describe the selected
   immutable Take. A different future Cast assignment remains separate.
6. Caption operation truth is limited to the selected Take/current context;
   obsolete Take Jobs cannot masquerade as the current caption state.
7. `durableOperationTruth` remains the sole durable Job interpretation helper
   beneath the compact Speech operation presentation.

## Real human product QA

QA used the designated persistent Production `test production of conversation`
(`05e19cd3-c2f6-4fa0-90c6-0159d11e3556`) rather than a disposable fixture.
The operator pass exercised visible editing and reorder affordances, real audio
playback, the global Player, bulk selection, Workbench state, the real provider
generation flow, multiple-Take review and selection, navigation away/return,
and neighboring Original and Tagged Takes.

Two deliberate paid generation requests were made, well below the approved
USD 5 QA-pass budget. No uncontrolled loop or paid failure manufacture was
used. The persistent Production retains a newer ready, unselected alternative
Take as useful future QA state.

The real pass found a pipeline defect that automation and DOM measurement alone
had missed: the frontend correctly submitted `select_result=false`, but the
application service filtered that command before persistence. The service now
preserves the explicit command. A regression test proves non-selection across
the application-service/repository boundary, and the existing explicit
selection behavior remains intact.

## Visual and interaction QA

- Reference: founder-selected option 2, 1487 × 1058.
- Final comparison: 1440 × 1024 implementation against the reference.
- Desktop: no horizontal document overflow at 1280, 1440, 1600, or 1920 px;
  the 1200 px ledger remains centered.
- Narrow safety: at 767 px the ledger contracts to 704 px; at 640 px Speech
  Parts switch to the compact responsive composition without page overflow.
- Runtime: no mature-state console warnings or errors.
- Interaction: edit, reorder menu, play/stop, bulk selection, generation,
  Takes review/selection, Workbench, navigate away, and reopen all verified.
- Exceptional states: real generating and ready-unselected states were used;
  deterministic fixtures cover failure, lost, ambiguous, retrying, and paid
  confirmation without wasting provider calls.

## Architecture and ownership

- `speech-part-card-model.ts` owns domain-to-card fact projection.
- `SpeechPartCard` owns stable React anatomy and rendered overflow observation.
- `SpeechOperationLane` owns compact conditional operation presentation only.
- `durableOperationTruth` remains the shared Job human-state interpreter.
- `speech-part-card.css` owns semantic ledger-row appearance.
- `SequenceWorkspace` owns sequence composition and visible-Part totals.
- `ProductionPage` retains Composer, inspector, Player, selection, and Job
  observation state ownership.

No new legacy `server.py`/`db.py` dependency, parallel Job state machine,
provider adapter path, or Origins shell integration was introduced.

## Verification

- React: 60 files, 203 tests passed.
- Python: 323 tests passed.
- Provider contracts: 31/31 passed.
- Render/destination contracts: 15/15 passed.
- Voice package and exact voice routing contracts passed.
- Domain integrity: 11/11 passed.
- OpenAPI export/generation, TypeScript build, and Vite production build passed.
- shadcn audit checklist completed: imports/dependencies, TypeScript/build, and
  real browser verification are clean.

## Stop

`SCOPE 1 COMPLETE ON ITS BRANCH. SCOPE 2 IS NOT AUTHORIZED OR STARTED.`
