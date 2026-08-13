# Scope completion report

## Scope

`Scope 1 — Canonical Speech Part`

## Commits

- Canonical selected-Take and Job truth projection: `c9324d5`
- Canonical Speech Part Card and reserved operation lane: `5860e36`
- Production actions, explicit Take intent, and caption Job observation: `ab82521`

## What changed

Speech Part is now the stable repeated object of Production rather than a clipped generic card. Its anatomy remains legible across draft, recorded, warning, selection, playback, Workbench, and durable Job states: immutable selected-Take Voice facts; model family, tier, capability, and language; approximately four script lines with inline expansion; selected Take ordinal, duration, count, immutable input state, captions, and historical spend; a reserved action rail; orthogonal warning badges; and a dedicated lower operation lane that does not replace the rest of the card.

The implementation follows the established Audio Studio/VORVN baseline and local shadcn primitives. It preserves the founder styling already verified on `main`, uses semantic project tokens, and does not introduce Origins shell integration or Scope 2 work.

## Approved precision corrections

1. `GenerateResult` was not reimplemented. The specialized OpenAPI/frontend response type documents the runtime's existing `part_id`, `take_id`, and `duration_ms`; no duplicate generation result behavior or backend field production was added for the card.
2. The existing explicit `select_result` contract remains authoritative. The recorded-Part New Take / Generate Alternative path submits `false`; a fresh or first recording may select; and the explicit **Update Part and generate** workflow still submits `true`.
3. `selected_take_number` is projected as a stable Part-local creation ordinal ordered by `(created_at, Take ID)` ascending. It is not derived from UI order.
4. Selected input state comes only from the immutable selected Take snapshot: `raw → Original`, `shaped → Spoken`, `tagged → Tagged`. Unknown historical truth remains `Input unknown`; populated text variants are never used to guess.
5. Recorded-card Voice, provider route, model/tier, capability, and language come from the immutable selected Take. A newer mutable Cast assignment is shown separately as a future-recording Voice only when it differs.
6. The projected caption Job must match the selected Take and current Part context. Obsolete Take caption failures/runs are excluded before they reach the card.
7. `durableOperationTruth` is the single Job interpretation helper used by both the compact Speech operation lane and the shared generic operation presentation. No second Job-status state machine was created.

## Final user behavior

The operator can scan every recorded Speech Part without opening a detail surface: who spoke the selected Take, the creative recording method, the authored words, which Take is selected, its duration and immutable input form, caption availability, and total historical spend remain visible while a Job runs or fails. Long text expands and collapses inline without replacing the card or moving the Canvas scroll owner. Draft Parts truthfully show that no recording exists.

Clicking the Take summary or **Review Take** opens the existing Takes tab. Clicking the CC status opens the existing Captions tab for that Part. **New Take** opens the shared Composer as **Generate alternative** and never silently promotes the result. Explicit editorial replacement remains available only through the existing **Update Part and generate** decision. Play, bulk select, overflow actions, and Workbench-active state remain independent and visually combinable.

## Component ownership

- New: `speech-part-card-model.ts` owns pure card fact projection; `SpeechOperationLane` owns only compact Speech presentation; `speech-part-card.css` owns Speech-card appearance.
- Reused: local shadcn Button, Badge, Checkbox, Collapsible, Dropdown Menu, Progress, Separator, Tabs, and Tooltip; `VoiceIdentity`; shared Player; existing Part inspector panels; Composer controller; Job observer; Production actions.
- Refactored: `SpeechPartCard` owns stable anatomy, not domain interpretation; `PartInspectorContent` accepts a validated initial tab; `ProductionPage` remains the sole interaction-state owner; the existing Production Job observer now follows the current caption Job as well as speech Job.
- Preserved elsewhere: generic `OperationState` and `SpeechRouteLabel` remain available to their non-card consumers.

## Replaced paths made unreachable

- The card-local `SpeechOperation` wrapper and its card-local `OperationState` interpretation are gone.
- The 220-character `clipText` Speech-card path is gone; complete authored text remains in the DOM.
- The generic two-line `.sequence-card-open > p` Speech presentation is no longer used and its styles were removed.
- The generic Speech-card meta row and card-level `SpeechRouteLabel` pill were replaced by canonical Take truth and method hierarchy.
- Obsolete `.part-operation-state` Production styles were removed after the reserved lane replaced that path.

## Domain/API impact

The Production read model and generated API typing gained selected-Take ordinal, immutable input-state, capability name, caption source language, and selected-Take-relevant Job projection. The OpenAPI Generate result response now describes fields already returned by the existing runtime. Caption Job persistence retains its existing Part/Take destination so the read model can reject obsolete operations. No provider request, adapter, speech generation pipeline, Take selection default, voice-language policy, identity model, or paid execution behavior was duplicated or broadened.

## Compatibility retained

Production document ordering, Part and Take IDs, Composer draft recovery, provider-neutral route selection, explicit paid confirmation, existing Take promotion, Part inspector panels, Caption actions, Cast assignment, Music, Assets, Mix/Export, global Player, normal Audio Studio tools, embedded presentation, and mobile presentation remain intact. The Scope 0 workstation geometry and founder styling baseline remain the host.

## Tests

- React: 60 files, 201 tests passed.
- Python: 322 tests passed.
- Provider/domain contracts: 31/31 passed.
- Render contracts: 15/15 passed; voice package and exact voice routing contracts passed.
- Build: OpenAPI export/generation, TypeScript project build, and Vite production build passed.
- Desktop browser: the updated branch was served separately against the real nine-Part Production and verified at 1280, 1440, 1600, and 1920 px. Horizontal document overflow was exactly 0 px at every width. Canvas scroll width equaled Canvas client width at every width. Browser console logs were empty.

## Adversarial checks

- Data truth: deterministic same-timestamp Take ordering; immutable selected-Take Voice/method despite newer mutable assignment; unknown historical input without guessing; stale caption Job exclusion.
- Card states: draft, recorded/ready, four-line long text, expanded text, playing, Workbench-active, bulk-selected, direct Voice, Cast-backed selected Take with differing future Voice, outdated, fidelity warning, missing audio, historical route unavailable, no caption, translated captions, stale captions, current caption generation, and caption failure.
- Durable operation lane: queued, running with progress, retrying, cost confirmation, review/ambiguous, failed, lost, cancelled, and completed unselected alternative. Voice/method, Take, caption, and spend facts remain mounted during active generation.
- Interaction: expansion changed the real first card from 302.1 px to 363.7 px while its top and Canvas scroll position remained unchanged; CC opened `Captions 0` directly with one Workbench-active row; New Take opened `Generate alternative · Part 1`; bulk selection showed `1 selected`; Play produced one playing card and one Pause action. No paid provider action was invoked.
- Responsive desktop measurements: at 1280/1440/1600/1920 px, document overflow was 0/0/0/0 px and the reserved operation lane remained 44 px high.

## Remaining items

Only Scopes 2–7 from the locked Production v2 program. None is authorized or started by this report. Mobile was not redesigned.

## Stop

`STOPPED. Waiting for approval for next scope.`
