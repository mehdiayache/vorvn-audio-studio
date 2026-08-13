# Decision amendments

Only add entries when the founder explicitly changes a locked product decision after this package was frozen.

Each amendment must contain date, exact decision changed, old rule, new rule, reason and affected scopes/components.

Do not use this file to rationalize implementation drift.

## 2026-08-13 — Desktop editing surface replaces the Workbench sidebar

**Decision changed:** the desktop Production editing geography used by
Composer, Part inspection, captions, Cast, Music, Health, and Mix & Export.

**Old rule:** keep the Production Canvas visible beside a resizable, remembered
Workbench panel and perform everyday editing inside that panel.

**New rule:** the Production sequence remains the persistent home surface, but
an editing action opens a dedicated full-workstation Stage with an explicit
Back to Production action. The Canvas stays mounted and preserves its scroll
position underneath, but it is inert while the Stage is active. Composer and
Part/caption work must never be presented as cramped sidebars. Mobile remains
outside this redesign.

**Reason:** founder review rejected the sidebar/Workbench interaction as
spatially cramped and visually weak. The approved direction requires airy Part
cards and a clearly separate, calm editing surface without losing sequence
context on return.

**Affected scopes/components:** Scopes 2–7; `ProductionStage`, Composer session,
Part Inspector, captions, Cast, Music, Health, Mix & Export, Focus Bar active
states, floating transport offsets, and the Spatial/Workbench lines in final
acceptance. Wherever the frozen package says “Workbench,” this amendment's
dedicated Stage is authoritative for desktop Production.

## 2026-08-14 — One active recording per Speech Part; Batch retired

**Decision changed:** the multi-Take creative stack and the top-level Batch
workspace.

**Old rule:** a Speech Part could retain several immutable Takes, generate an
unselected alternative, and promote one Take; Batch was a supported top-level
Audio Studio tool.

**New rule:** a Speech Part owns exactly one active recording. `Record` creates
it and `Replace recording` atomically replaces it. There is no alternative
generation, Take list, ordinal, selection, promotion, or Takes Workbench. A
stale concurrent provider result is not attached to the Part. Durable Jobs,
ProviderAttempts, budget records and audit evidence remain authoritative for
history and spend. The internal `takes` table remains only as the one-slot
provider snapshot backing a Speech Part, protected by a unique Part index.
Batch is removed from navigation, routes, API, worker dispatch, application
services, persistence adapters, dependencies and current product documentation;
historical Batch Job rows may remain as legacy operation evidence.

**Reason:** the founder explicitly chose a lighter product model and removed
both alternative recordings and Batch. Safety requires retaining accounting
and provider evidence while eliminating the user-facing systems.

**Affected scopes/components:** all Production v2 Take requirements are
superseded. Speech Part, Composer, Part Stage, captions, Cast copy, Mix/Export,
media downloads, OpenAPI, worker routing, database constraints and final
acceptance now use active-recording semantics. Batch regression requirements
are replaced by proof that the removed Batch route is unreachable.
