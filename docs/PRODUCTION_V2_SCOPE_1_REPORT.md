# Scope completion report

## Scope

`Scope 1 — Canonical Speech Part`

## Commits

- Canonical selected-Take and Job truth projection: `c9324d5`
- Initial canonical Speech Part presentation: `5860e36`
- Production actions, explicit Take intent, and caption Job observation: `ab82521`
- Permanent UI/UX quality gate: `64dedb7`
- Semantic color grammar and native Codex Skills rule: `8b3b238`
- Founder-review presentation rebuild: `65c9f97`
- Measured desktop-density refinement: `370bd0d`

## Final result

Speech Part is now the stable repeated object of Production and its Ready state is a compact editorial row, not a large form. The hierarchy is deliberate: selected-Take Voice or Cast role first; complete model family, tier, neutral capability and output language second; authored script third; then one result footer containing playback and duration, selected Take and immutable input state, captions, historical spend, New Take, and overflow actions.

Normal Ready state is visually quiet. Direct-Voice chrome, repeated editorial flags/personality metadata, the script-side action rail, and the permanently empty operation lane are gone. Durable generation, confirmation, review, failure, and warning presentation appears below the result footer only when exceptional truth exists. The existing Job interpretation remains the sole state machine underneath that conditional presentation.

The final implementation translates the established UI VORVN foundation into React using Audio Studio's semantic tokens and local shadcn primitives. Neutral surfaces carry ordinary state; primary color remains focused on active interaction; warning and destructive colors are reserved for actual warnings and failures. It does not copy catalog HTML/CSS, introduce Origins shell integration, revert founder styling, or start Scope 2.

## Approved precision corrections

1. `GenerateResult` was not reimplemented. The specialized OpenAPI/frontend response type documents the runtime's existing `part_id`, `take_id`, and `duration_ms`; no duplicate generation result behavior or backend field production was added for the card.
2. The existing explicit `select_result` contract remains authoritative. The recorded-Part New Take / Generate Alternative path submits `false`; a fresh or first recording may select; and the explicit **Update Part and generate** workflow still submits `true`.
3. `selected_take_number` is projected as a stable Part-local creation ordinal ordered by `(created_at, Take ID)` ascending. It is not derived from UI order.
4. Selected input state comes only from the immutable selected Take snapshot: `raw → Original`, `shaped → Spoken`, `tagged → Tagged`. Unknown historical truth remains unknown; populated text variants are never used to guess.
5. Recorded-card Voice, provider route, model/tier, capability, and language come from the immutable selected Take. A newer mutable Cast assignment is shown separately as a future-recording Voice only when it differs.
6. The projected caption Job must match the selected Take and current Part context. Obsolete Take caption failures/runs are excluded before they reach the card.
7. `durableOperationTruth` is the single Job interpretation helper used by both the conditional Speech operation presentation and the shared generic operation presentation. No second Job-status state machine was created.

## Final user behavior

An operator can scan nine or many more Speech Parts as a production sequence instead of reading nine independent forms. Every recorded row keeps the selected recording's Voice, exact creative method, authored words, selected Take truth, duration, captions, and spend in stable places. Short scripts remain compact; long scripts show a two-line reading preview and expose **Show more** only when rendered text actually overflows. Expansion keeps the full script in the DOM and changes only that Part.

The Take summary and **Review Take** open the existing Takes tab. CC opens the existing Captions tab. **New Take** opens the shared Composer as **Generate alternative** and never silently promotes the result. Explicit editorial replacement remains available only through the existing **Update Part and generate** decision. Play, bulk selection, overflow actions, Workbench state, Cast color, and exceptional Job truth remain independent and combinable.

## Component ownership

- `speech-part-card-model.ts` owns pure domain-to-card fact projection.
- `SpeechPartCard` owns the stable React anatomy and rendered-overflow observation, not domain interpretation.
- `SpeechOperationLane` owns only the conditional Speech operation presentation and returns no UI for idle state.
- `speech-part-card.css` owns the row's appearance using semantic Audio Studio/VORVN tokens.
- Reused local shadcn primitives: Button, Checkbox, Collapsible, Dropdown Menu, Progress, Tabs, and Tooltip. `VoiceIdentity` remains the shared portrait resolver and can suppress repeated copy/editorial flags in dense contexts.
- `ProductionPage` remains the sole interaction-state owner; the existing Part inspector, Composer controller, Job observer, Player, caption flow, and Production actions remain the owners of their established responsibilities.

## Replaced paths made unreachable

- The card-local `SpeechOperation` wrapper and competing card-local Job interpretation are gone.
- The 220-character `clipText` and generic two-line `.sequence-card-open > p` Speech paths are gone; complete authored text remains in the DOM.
- The old Ready-card action rail beside the script is gone. Playback, New Take, and overflow now live in the result footer.
- The `Direct voice` chip and repeated identity flag/personality line are not rendered in the dense Production row.
- Idle operations render nothing; the former permanently empty 44 px operation lane no longer exists.
- The generic Speech meta row and card-level route pill were replaced by canonical selected-Take facts and the complete method hierarchy.

## Domain/API impact

The Production read model and generated API typing gained selected-Take ordinal, immutable input state, capability name, caption source language, and selected-Take-relevant Job projection. The OpenAPI Generate result response describes fields already returned by the existing runtime. Caption Job persistence retains its existing Part/Take destination so the read model can reject obsolete operations. No provider request, adapter, speech generation pipeline, Take selection default, voice-language policy, identity model, or paid execution behavior was duplicated or broadened by the presentation rebuild.

## Compatibility retained

Production ordering, Part and Take IDs, Composer draft recovery, provider-neutral route selection, explicit paid confirmation, existing Take promotion, inspector panels, Caption actions, Cast assignment, Music, Assets, Mix/Export, global Player, normal Audio Studio tools, embedded presentation, and mobile presentation remain intact. Scope 0 workstation geometry and the verified founder styling baseline remain the host.

## Tests

- React: 60 files, 203 tests passed.
- Python: 322 tests passed.
- Provider contracts: 31/31 passed.
- Render/destination contracts: 15/15 passed; voice package and exact voice routing contracts passed.
- Domain: 11/11 checks passed.
- Build: OpenAPI export/generation, TypeScript project build, and Vite production build passed.
- shadcn audit: local primitive imports/dependencies, TypeScript/build health, and rendered-browser verification completed.
- Desktop browser: the rebuilt branch was served against the real nine-Part Production and visually inspected at 1280, 1440, 1600, and 1920 px. Browser runtime logs were empty.

## Adversarial and visual checks

- Data truth: deterministic same-timestamp Take ordering; immutable selected-Take Voice/method despite newer mutable assignment; unknown historical input without guessing; stale caption Job exclusion.
- Card states: draft, recorded/ready, long and short text, expanded text, playing, Workbench-active, bulk-selected, direct Voice, Cast-backed selected Take with differing future Voice, outdated, fidelity warning, missing audio, historical route unavailable, no caption, translated captions, stale captions, current caption generation, and caption failure.
- Durable operations: queued, running with progress, retrying, cost confirmation, review/ambiguous, failed, lost, cancelled, and completed unselected alternative. The ready anatomy stays mounted during exceptional operations; idle state adds no empty UI.
- Real rendered sequence: all 9 Parts mounted; 7 overflowing Ready rows measured 182 px and 2 short Ready rows 138 px. The previous accepted-but-rejected presentation's roughly 302 px Ready cards, script-side action rail, Direct-Voice chip, repeated flags, and empty lower lane are absent.
- Rendered overflow: 7 genuinely overflowing scripts exposed **Show more**; 2 fitting scripts did not. Expanding the first row changed only that row from 182 px to 274 px, changed the control to **Show less**, and exposed the full script.
- Responsive desktop: at 1280/1440/1600/1920 px, all cards remained 792 px in the full Canvas, document/card/method horizontal overflow was 0, and footer controls did not wrap at 1280 px.
- Workbench active: at 1440 px the active card remained 777 px wide and 182 px high with 0 horizontal overflow. The active treatment did not suppress the Cast rail (`opacity: 1`).
- No paid provider action was invoked.

## Remaining items

Only Scopes 2–7 from the locked Production v2 program. None is authorized or started by this report. Music Bed remains intentionally unchanged for its later scope. Mobile was not redesigned.

## Stop

`STOPPED. Waiting for approval for next scope.`
