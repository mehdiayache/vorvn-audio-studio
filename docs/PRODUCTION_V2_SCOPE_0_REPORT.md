# Scope completion report

## Scope

`Scope 0 — Desktop Production shell rupture`

## Commit

`0188dc5aebab45d62018ee5eba8895c9abe57b06`

## What changed

Production now uses the locked desktop workstation geometry: a 56 px Focus Bar, a persistent scroll-owning Canvas, a resizable and locally remembered right Workbench, a sticky Sequence toolbar, a compact parallel Music Bed lane, and a Floating Transport centered over the available Canvas. The source-of-truth package is preserved under `docs/production-v2/`, with Scope 0 marked complete and no later scope authorized.

## Final user behavior

The operator stays in one Production workspace. Selecting a Part opens its existing Script, Takes, Captions, and Details surfaces in the Workbench without removing the Sequence. Add Speech opens the existing Composer controller in that same Workbench. Mix & Export is also contextual and leaves the Canvas mounted. Closing the Workbench restores the full Canvas, its scroll position, and focus. The splitter supports pointer and keyboard resizing and restores the saved width on reload. Existing playback uses one global Player and appears centered over the Canvas even while the Workbench is open.

## Component ownership

- New: `ProductionWorkbench`, `ProductionSequenceToolbar`, `ProductionFloatingTransport`, and desktop/mobile Composer hosts.
- Reused: `ComposerSurface`, `SequenceWorkspace`, `TimingOverview`, `MixExportWorkspace`, global Player, Part inspector panels, Cast, Music, Production actions, Jobs, and existing API contracts.
- Refactored: `ProductionPage` remains the sole Production interaction-state owner; `ProductionEditorCanvas` owns spatial composition; `PartInspectorContent` is host-independent with a mobile-only Sheet wrapper; `TransportStrip` accepts the Production host; Focus Bar and Sequence rows expose the new spatial state.
- Deleted: obsolete desktop `StudioDock`, its test, all `.studio-dock`/`.has-studio-dock` CSS, and its theme height tokens. The everyday desktop Part Sheet path is unreachable; only the explicitly mobile wrapper remains.

## Domain/API impact

None. No database model, HTTP contract, generated API type, provider adapter, routing policy, persistence rule, Job lifecycle, Take selection rule, or voice-language invariant changed. No provider call was made.

## Compatibility retained

The existing Composer controller/draft recovery, Part actions and detail loaders, Production Cast, Music controls, preview/export service, Venture assets, global Player, durable Jobs, mobile Composer Sheet, and mobile Part Inspector Sheet remain the compatibility seams. The Workbench is a spatial host and does not duplicate domain state.

## Tests

- Targeted: Workbench mount continuity and remembered keyboard width; Composer draft recovery after Workbench close/reopen; Part tab ownership; lazy Timing view.
- React: 58 files, 176 tests passed.
- Python: 321 tests passed.
- Domain: 11/11 checks passed.
- Provider contracts: 31/31 passed; render contracts 15/15 passed; voice package and exact routing contracts passed.
- Build: OpenAPI generation, TypeScript, and Vite production build passed.
- Desktop browser: real 9-Part Production verified at 1280, 1440, 1600, and 1920 px; no horizontal document overflow; Canvas and Workbench scroll independently; Composer footer has zero horizontal overflow; saved width restored; Part selection preserved Canvas scroll at 259.5 px; Floating Transport Canvas-center delta was below 0.01 px; browser console had no warnings or errors.

## Adversarial checks

Verified the existing real Production with nine recorded Parts, multiple provider/model bindings, Takes, long canonical text, linked Music Bed, historical generation spend, and Mix/Export readiness. Verified no-Cast suppression in the component path, Canvas continuity across Part/Composer/Mix modes, nonmodal desktop behavior, long Workbench content scroll, focus restoration, collapsed Music lane, Timing view, active Part context, and no paid action. Active Job/failure/blocked/ambiguous internals were not redesigned in Scope 0 and remain owned by the preserved components and passing repository contracts.

## Remaining items

Only Scopes 1–7 from the locked Production v2 program. None is authorized or started by this report.

## Stop

`STOPPED. Waiting for approval for next scope.`
