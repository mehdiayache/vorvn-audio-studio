# Production UI handoff v4 — implementation audit

This document prevents the prototype from being treated either as production code to copy or as optional visual inspiration. It records the intended interaction, the real application contract, and the implemented result.

## Interpretation rule

- The technical brief owns domain truth and no-regression behavior.
- The HTML owns spatial relationships, hierarchy, interaction grammar, and useful disclosure ideas.
- The live API owns which actions and states may be presented as real.
- Unsupported demo concepts remain absent rather than becoming decorative controls.

## Surface mapping

| Prototype idea | Product interpretation | Implemented behavior |
| --- | --- | --- |
| Global Voice Studio shell | One application, not a Projects sub-app | Full VORVN identity, real tool routes, active Projects destination, connection state |
| Production context bar | Persistent context and primary Production actions | Folder-based Explorer trigger, real breadcrumbs, Mix & Export, and Add part; fake lifecycle tabs and static Saved state removed |
| Floating tool dock | Context navigation and inspection, not a second creation toolbar | Explorer, sequence structure, voices, Venture assets, search, real issues, supported commands |
| Floating Explorer panel | Temporary semantic navigation without permanent width loss | One shadcn Popover beside the dock, backed by the real hierarchy and reused by the header trigger |
| Connected sequence and spine | Primary editable source order | Real speech, draft, silence and linked-asset objects; numbered nodes; selection and local actions |
| Insertion seams | Exact captured destination | Anchored menu for speech, silence and Venture audio; the selected insertion index is passed to the existing Sheet workflow |
| Production playback surface | Primary shared Production clock | Full-production playback is visible before the sequence; proportional narration blocks locate real parts; music remains parallel |
| Music controls | Mix context, never a sequential clip | Current bed, source audition, level, source position, ducking, replace and remove are visible on the first screen |
| Floating player | One resource-aware transport | Persistent idle/full-production state, explicit resource label, seek, volume, speed, return-to-production and lawful download behavior |
| Voice identity | Provider ids are storage, not interface copy | One resolver and component serve cards, context tools, Composer, details and takes with friendly names, images and descriptions |
| Source-card actions | Stable geometry and clear intent | Card content opens details; selection is separate; Play and overflow use a reserved action rail; menus do not reflow text |
| Release lens | Same Production, publishing emphasis | Real readiness, faithful preview, MP3 export and immutable history using existing endpoints |

## Deliberately not fabricated

- Approval states not represented by current API data
- Invented pronunciation-analysis results
- A fake generation queue
- A fake Production Assistant
- Unsupported mastering presets or WAV export
- Download of derived preview cache files
- Music as a sequence item

## Verification contract

- Desktop: no permanent Explorer column; panel opens beside dock; 820 px sequence inside a 1120 px workspace.
- Mobile 390 px: panel is 328 px wide, remains within viewport, and document width stays 390 px.
- Header and dock Explorer triggers open the same panel component.
- Dock accessible labels match the seven handoff tools.
- Header and seam Add menus expose only supported source types.
- Player tests assert a visible idle Production state, preview-cache non-downloadability and downloadable source behavior.
- TypeScript build, frontend tests and the native FastAPI architecture/HTTP
  suites must pass before handoff.
