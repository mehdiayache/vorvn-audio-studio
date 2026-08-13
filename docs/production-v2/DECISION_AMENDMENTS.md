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
