# Scope 5 completion report

## Scope

`Scope 5 — Cast + Music + Asset spatial integration`

## Status

`COMPLETE ON codex/production-v2-scopes-2-7 — READY FOR THE SCOPE 5 CHECKPOINT.`

Scope 5 integrates optional Cast, the one parallel Music Bed, reusable Venture
audio, and compact Silence into the approved direction 2 Production
workstation. It changes presentation and spatial ownership without changing
Part, Take, Cast, Music, or Asset domain truth.

## Product result

- A Production with no Cast has no empty reel or mandatory Canvas pollution.
- When Cast exists, the Canvas shows one compact horizontal reel with stable
  role color, role name, Voice avatar/name, and Part count.
- Header Cast and reel interaction open the stable desktop Production
  Workbench, not an everyday Sheet.
- Cast Workbench states the future-only recast rule at the top: future
  recordings use the new Voice while immutable existing Takes remain
  unchanged.
- Cast creation includes a restrained stable role-color palette. Color is
  always paired with role text and Voice identity; it is never the sole signal.
- Owned roles still choose only Voice Identity. Exact route/method remains an
  explicit later Composer choice. Catalogue roles retain exact catalogue Voice.
- Music is one compact parallel lane above Sequence. Its source, duration,
  level, ducking, preview freshness, audition, and Edit action are visible
  without expanding a second editor into the Canvas.
- Music Workbench owns source audition, mix level, source offset, ducking,
  fades, replacement, and confirmed removal. Music never becomes a sequential
  Part.
- The Asset Explorer is a large temporary modal with destination tabs,
  categories, counts, search, upload/drop, an explicit selection state, and a
  dedicated audition action.
- Audition never inserts. Sequence insertion or Music replacement happens only
  from the final `Insert selected asset` / `Use as Music Bed` action.
- Replacing linked audio preselects its exact source when available. Replacing
  Music preselects the current Music asset while still requiring an explicit
  final action.
- Linked Asset cards expose Play, Open source in Asset Explorer, Replace,
  provenance, duration, missing-source truth, reorder, and delete behavior
  without projecting Speech concepts.
- Silence remains a compact inline exact-duration object with no Voice, Take,
  provider operation, captions, or generation cost.

## Architecture and truth

`ProductionPage` owns which desktop Workbench mode is active. Cast and Music
now compose through the same persistent Workbench geometry as Part, Composer,
and Mix/Export. Canvas stays mounted and retains its scroll position.

`CastManagerContent` owns Cast-role creation/recast interaction and is reused by
the retained mobile Sheet wrapper. Desktop does not render that Sheet.
`ProductionCastStrip` owns only the optional Canvas reel.

`ProductionMusicLane` owns the compact Canvas projection. `MusicWorkbench`
owns music editing. Both call the existing `setMusic` application path and the
one global Player; no duplicate mix model, audio element, or local playback
state machine was created.

`AssetTool` remains the single Asset Explorer core for Sequence and Music
destinations. The existing Venture asset APIs remain authoritative for upload,
insert, replace, and Music assignment.

## Information hierarchy and color grammar

The Canvas shows only immediate operator facts. The Workbench reveals editing
controls and future-only semantics. The temporary Asset Explorer handles broad
library browsing without replacing the spatial Workbench.

Neutral white/raised surfaces carry ordinary structure. Blue marks active
selection, role assignment focus, and Workbench context. The Asset semantic
token marks Music and reusable audio. Amber remains warning/stale state. Red is
reserved for destructive removal or failure. Green remains ready/free truth.
Role colors are stable identity accents and always appear beside a role name
and Voice; they never communicate health or operation status.

shadcn Dialog, Tabs, Select, ScrollArea, Button, Input, Slider, Dropdown Menu,
Checkbox, and Sheet composition was queried/audited before completion. Existing
local primitives were reused; no replacement primitive or dependency was added.

## Replaced paths made unreachable

- Desktop Cast no longer renders `CastManagerSheet`; only its reusable content
  appears in Production Workbench. The Sheet wrapper remains reachable on
  mobile because mobile was explicitly not redesigned.
- The collapsible Canvas Music details surface was removed.
- Timing no longer mounts a second full Music editor below the timeline.
- `frontend/src/components/music-bed.tsx`, its stylesheet, and its tests were
  deleted after `MusicWorkbench` and `ProductionMusicLane` were verified.
- Asset rows no longer mutate the Production directly. They first select;
  mutation is owned by the explicit explorer footer action.
- The previous narrow asset dialog geometry was replaced by a large explorer
  with category navigation and separate results/footer regions.

## Real human product QA

Desktop exploratory QA used the persistent `test production of conversation`
Production (`05e19cd3-c2f6-4fa0-90c6-0159d11e3556`) at a 1499 px working
viewport.

The pass reviewed the retained 0:49 Music asset at its real 56% level with
ducking enabled and an intentionally stale Production preview. It opened Music
Workbench, inspected the source, audition action, offset, fades, ducking,
replacement, and removal hierarchy, then opened the Asset Explorer. The
current Music source was preselected only after the final rebuilt application
was reloaded; closing the explorer made no Production change.

QA opened the optional Cast Workbench from the Focus Bar while the Production
had no roles and confirmed no empty Cast reel existed. It then created and
retained a realistic `Jenna` Cast Role using the existing `nenek Jenna` owned
Voice Identity. The compact reel appeared immediately with role color, role,
Voice, and Part count. The Workbench retained explicit future-only recast copy.

The final Sequence pass inspected the existing 1.4-second Silence object in
context below six neighboring Speech Parts. It remained compact, editable, and
free of Speech/provider concepts. The Sequence Asset Explorer empty states for
Intro/Outro/Stinger categories were also inspected; no placeholder asset was
invented or uploaded merely to fill the UI.

No paid provider call was required. No mobile design or QA was performed.

## Verification

- React: 68 files, 224 tests passed.
- Python: 323 tests passed.
- Provider contracts: 31/31 passed.
- Render/destination contracts: 15/15 passed.
- Voice package and exact-routing contracts passed.
- Domain integrity: 11/11 passed after the persistent Cast-role creation.
- OpenAPI export/generation, TypeScript, and Vite production build passed.
- Focused Cast/Music/Asset/Page suites: 6 files, 10 tests passed before full
  convergence.
- `git diff --check` passed.
- shadcn component audit completed.

## Checkpoint boundary

`SCOPE 5 COMPLETE. NEXT IMPLEMENTATION TARGET: SCOPE 6 — LONG-PRODUCTION MANIPULATION AND PRODUCTIVITY.`
