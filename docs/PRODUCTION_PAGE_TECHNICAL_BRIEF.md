# VORVN Voice Studio — Production page technical brief

This document describes the Production page as a product and technical system. It is deliberately independent of the current visual styling so a product-design model can propose a new interface without mistaking legacy layout decisions for requirements.

## 1. Product purpose

Voice Studio turns written material into finished spoken productions. A user should be able to:

1. create or import spoken parts;
2. arrange them in order;
3. insert deliberate silence;
4. reuse venture-owned intros, outros and transitions;
5. place one background-music bed under the complete sequence;
6. preview exactly what the final production will sound like;
7. publish immutable exports while keeping the editable source sequence.

It is not intended to become a general-purpose DAW. It should provide the smallest set of editing operations needed for narration, guided audio, audiobooks, prayers, promotional speech and similar voice-led content.

## 2. Domain hierarchy

The hierarchy is semantic, not a generic nested-folder system.

- **Venture**: a brand or business. It owns identity, naming rules, voices and reusable assets. Creating one is uncommon and important.
- **Project**: a body of work inside a Venture, for example “Sleeping guides”.
- **Production**: one editable audio piece, for example one episode or guide. It owns an ordered sequence, mix settings and exports.
- **Venture Assets**: reusable source media divided into fixed collections:
  - Music: background beds; never inserted as sequential parts.
  - Intros: reusable openings.
  - Outros: reusable endings.
  - Stingers: short reusable transitions.
- **Unsorted**: system inbox for recordings that have not yet been filed.

Only a Production and Unsorted can contain recording parts. A Venture and Project organize work. Asset collections store reusable resources rather than generated speech.

## 3. URL and navigation state

The page is a real URL-addressable application state:

`/?tab=projects&project={productionId}`

Back/Forward navigation must restore the selected hierarchy item. Breadcrumbs, Explorer, overview, capabilities and content all consume one indexed hierarchy model. Links must navigate, not behave like decorative text.

## 4. Page jobs

The page currently combines five distinct jobs. A redesign may separate them spatially, progressively disclose them or create modes, but none may disappear.

1. **Context** — where am I and what am I producing?
2. **Composition** — add, edit and arrange source parts.
3. **Timing** — understand duration, silence and ordering on one clock.
4. **Mix preview** — hear narration plus music using current settings.
5. **Publishing** — render and manage immutable output versions.

## 5. Current page anatomy

### 5.1 Global application header

Contains top-level tools: Speak, Projects, Batch, Voices, Activity, Subtitles and Settings. It also exposes the current filing destination, key connection state, keyboard help and theme.

These are application tools. Projects uses those tools; it is not a duplicate application.

### 5.2 Projects context bar

A sticky bar immediately below the global header contains:

- Explorer show/hide control;
- “Projects” section identity;
- compact current hierarchy path;
- on small screens, a persistent Preview control for the open Production.

This bar is navigation context, not the Production editor toolbar.

### 5.3 Explorer

The Explorer is an optional hierarchy rail. It shows:

- Ventures with brand identity;
- each Venture’s reusable Assets library;
- Projects;
- Productions;
- Sandbox;
- Unsorted.

It supports expand/collapse, search and current-item highlighting. It is a collapsible rail on desktop and an off-canvas drawer on smaller screens. Deep indentation is capped so long names retain usable width.

The Explorer should answer “where is this?” It should not be the only way to understand the object currently open.

### 5.4 Production overview

The overview contains:

- full breadcrumbs;
- Production identity image/icon;
- editable Production name;
- editable description;
- Settings;
- Mix & Export;
- number of source parts;
- current source-sequence duration;
- cumulative audio-generation spend.

Spend is historical generation spend, not the price of exporting. Reusing audio, adding silence, previewing and local FFmpeg rendering do not call Alibaba and add no generation cost.

### 5.5 Source toolbar

The composition toolbar contains:

- **Add speech** — opens the shared Composer inside this Production;
- **Library audio** — chooses a reusable Intro, Outro or Stinger from the current Venture;
- **silence duration + Add silence** — inserts a free timed gap;
- **Preview sequence / Preview with music** — hears the exact current production state.

On desktop the toolbar remains available during vertical scrolling. On phone, Preview lives in the sticky context bar so the full multi-row creation toolbar does not obscure the content.

### 5.6 Timeline

The timeline is a compact overview, not the primary detailed editor and not a decorative progress graphic.

It uses one horizontal production clock and contains:

- a time ruler;
- a Narration lane;
- a Music lane;
- zoom controls.

Narration blocks represent recorded speech, drafts, silence and linked assets. Width is proportional to duration. Clicking a block locates its detailed row.

The Music lane represents one bed spanning the whole Production. It directly exposes:

- source-track audition;
- volume as a continuous percentage;
- source start position (slip edit);
- whether the source is trimmed, looped or naturally fits;
- access to fades and ducking.

Music is parallel to narration. It is never the next sequential clip.

### 5.7 Detailed sequence rows

Every source object uses one typed row component with variants.

#### Recorded speech

- order number and drag target;
- voice identity and voice metadata;
- explicit duration;
- spoken text;
- cumulative cost and take count;
- subtitle state;
- translated-subtitle languages;
- Play;
- create another take;
- duplicate without a new model call;
- move up/down;
- overflow actions for cross-Project move and deletion.

#### Draft speech

- text and saved Composer settings;
- “Not recorded” state;
- Record now;
- Edit;
- ordering, duplicate and deletion controls.

A draft contributes zero seconds until recorded and must not silently disappear from a published export.

#### Silence

- order number;
- semantic “Silence” identity;
- inline seconds input, constrained to 0.1–120 seconds;
- free status;
- duplicate;
- move up/down;
- delete.

Changing duration occurs inline and updates timeline and totals. No modal is required.

#### Linked Venture asset

- linked media identity and duration;
- free/reused state;
- Play;
- open source in Venture library;
- ordering and duplicate controls.

It remains linked to a versioned Venture Asset. A missing source is a visible error and blocks a faithful preview/export.

### 5.8 Between-part insertion

Insertion seams allow a user to add speech, silence or reusable library audio at an exact position instead of adding only at the end and then repeatedly moving it upward.

### 5.9 Selection and bulk operations

Rows can be selected individually or with Shift ranges. A contextual bulk bar supports:

- Select all;
- Move selected parts to another Production;
- Delete selected parts;
- Clear selection.

### 5.10 Inline Composer

There is one shared Composer component used both by the independent Speak tool and Projects. When launched from a Production, it moves inline into the page and captures:

- destination Production;
- optional insertion position;
- optional existing draft/part;
- text state: Raw, Spoken and Tagged;
- voice;
- engine/model and quality;
- language;
- exact reading versus directed performance;
- performance direction;
- speed, pitch, volume and seed where supported;
- output format.

Its primary action names its destination: Generate and add Part N. Save as draft persists text and settings without sending anything to Alibaba.

### 5.11 Asset browser

Library audio is a captured-destination workflow. It must distinguish auditioning an asset from inserting it. Music is excluded because it belongs on the parallel Music lane. Only Intros, Outros and Stingers can become sequential linked parts.

### 5.12 Mix & Export panel

This is an off-canvas production panel, not permanent third-column navigation. It contains:

- Record all drafts;
- Export production / Export new version;
- immutable prior exports;
- music source choice;
- music source audition;
- volume and start position mirrors;
- fade-in and fade-out durations;
- duck-under-speech setting;
- remove-music action;
- link to the Venture Music library.

Each export is an immutable snapshot of source parts, silence, linked-asset versions and mix settings. Editing the Production later does not mutate earlier exports. An export whose duration no longer matches the source sequence is visibly out of date.

### 5.13 Shared global player

One reusable player owns all application playback. It contains:

- play/pause;
- current title and context;
- voice or music identity;
- generated waveform;
- seek;
- elapsed/total time;
- playback speed;
- download when the current track is downloadable;
- keyboard shortcuts.

Starting another playback stops the current one. Preview cache files are intentionally not offered as downloads because they are derived working state, not published outputs.

## 6. Production-preview architecture

### Previous incorrect behavior

The browser built a queue of raw parts. It loaded each speech file into the single global `<audio>` element, used a JavaScript timer for silence and then loaded the next part. The selected music bed was absent because one HTML audio element cannot simultaneously play a narration queue and a synchronized background bed.

This also meant that Play sequence did not represent the same state as Export.

### Current correct behavior

`POST /api/v1/jobs/render` with `operation: "preview"` performs a durable,
local, non-published render:

1. load current Production parts;
2. exclude prior exports and unrecorded drafts;
3. reject missing linked assets;
4. normalize each audio source to stereo 48 kHz;
5. materialize silence as real PCM duration;
6. concatenate the complete narration lane;
7. load and loop the selected Music asset;
8. slip it to the configured source-start position;
9. trim it to Production duration;
10. apply continuous volume;
11. apply fade in/out;
12. optionally side-chain compress it under speech;
13. mix narration and music without reducing narration level;
14. encode one 192 kbps MP3 preview;
15. play that file through the shared global player.

The preview and export use the same `_render_sequence` and `_mix_music` functions. Therefore what the user hears is representative of the published file.

The preview filename contains a SHA-256-derived fingerprint of ordered parts, resolved asset versions and every mix setting. An unchanged Production reuses its cached preview immediately. Any relevant edit creates a new fingerprint. Older preview caches for that Production are removed. Previewing writes no database Export, no Activity cost and makes no Alibaba request.

## 7. Core data model

### Project/Production fields relevant to this page

- id, parent_id, container_type, system_role;
- name, description, icon;
- updated_at;
- naming and inherited Venture settings;
- music_of;
- music_volume;
- music_start;
- music_fade_in;
- music_fade_out;
- music_duck.

### Source-part fields

- id, project_id, position, kind;
- title and text;
- raw/shaped/tagged text states;
- voice, engine, model, language and performance settings;
- filename, duration, size and format;
- cost and cost basis;
- take/version links;
- linked Asset and Asset-version identity;
- transcript/subtitle state.

### Export fields

- Production and generated-file identity;
- duration and size;
- renderer identity;
- immutable manifest;
- source-part/version list;
- music asset and mix settings;
- creation timestamp.

## 8. Relevant API surface

- `GET /api/v1/hierarchy` — canonical hierarchy.
- `GET /api/v1/productions/{id}/editor` — one Production and its Parts.
- `POST /api/v1/jobs/render` with `operation: "preview"` — cached faithful preview, not an Export.
- `POST /api/v1/jobs/render` with `operation: "export"` — publish an immutable Export.
- `GET/PATCH /api/v1/productions/{id}/music` — music source and mix settings.
- `POST /api/v1/productions/{id}/parts/silence` — insert silence.
- `PATCH /api/v1/productions/{id}/parts/{part}/silence` — edit its duration.
- `POST /api/v1/productions/{id}/parts/reorder` — persist sequence order.
- `/api/v1/jobs/speech` — create, render Draft or make another Take.
- `/api/v1/asset-collections/{id}/assets/upload` — upload reusable media.
- `/api/v1/jobs/transcription` and `/api/v1/jobs/translation` — Captions work.

## 9. State and capability rules

The UI must derive actions from the opened domain type, not merely hide controls after a click.

- Venture: manage brand and see Projects/Assets; no recording Composer.
- Project: organize Productions; no recording sequence.
- Production: full composition, timing, preview, mix and export.
- Asset collection: upload/drag-drop and manage reusable files; no generation or Export.
- Unsorted: manage loose recordings with reduced organizational semantics.

Requests are guarded so a slow response from a previously opened object cannot overwrite the current page. Autosaves capture the object ID they belong to.

## 10. Responsive requirements

- Desktop Explorer can collapse to return width to the Production.
- Tablet Explorer becomes off-canvas.
- Phone keeps the hierarchy path concise and Preview persistent in the context bar.
- Timeline may horizontally scroll because time remains spatial; the entire document must not overflow horizontally.
- Detailed rows reflow actions below content while keeping duration prominent.
- Arabic and other RTL text use automatic direction without reversing application controls.
- No important control may be covered by the global player.

## 11. Non-negotiable product truths for a redesign

1. Venture, Project, Production and Asset collection must look and behave like different object types.
2. Source sequence and published Exports are different resources.
3. Music is parallel to narration, not a sequential clip.
4. Preview must represent the final mix, not only the raw speech queue.
5. Silence is an editable timed object, not an audio-generation request.
6. Reusable assets belong to the Venture and remain linked/versioned.
7. Voice identity, duration and spoken text are the primary row information.
8. Cost is cumulative model spend and must not imply that local editing costs money.
9. Advanced model and mix controls should be progressively disclosed, not removed.
10. The same shared Composer and Player must work independently and inside Projects.
11. Long productions must remain manageable without returning to the top for playback or creation.
12. The UI should feel like one coherent production system, not dialogs and cards stitched from unrelated tools.

## 12. Known design tensions to solve

These are open design problems, not requirements to preserve the current layout:

- How much editing belongs directly on the timeline versus in detailed rows?
- Should detailed rows be a list below the timeline, a synchronized inspector, or a mode switch?
- How should a user see which detailed part is currently playing in a single rendered preview?
- How should music start position communicate “slip source under a fixed Production” without looking like a second duration control?
- How should subtitles, translations and takes remain accessible without making every row visually dense?
- Should Add speech be a persistent command bar, a contextual insertion affordance, or both?
- How should mobile expose ordering without six tiny icon buttons?
- How can Mix & Export show readiness, blocking drafts/missing assets and stale exports before the user presses Export?
- How should the global player relate visually to the active Production without becoming a second competing timeline?

## 13. Requested redesign output

Propose a production-grade information architecture and interaction model before styling. Provide:

1. desktop and mobile page anatomy;
2. component hierarchy;
3. primary and secondary action hierarchy;
4. empty, loading, playing, dirty, missing-asset, draft and exporting states;
5. timeline/row synchronization behavior;
6. music editing behavior;
7. progressive-disclosure strategy;
8. keyboard and accessibility behavior;
9. responsive rules;
10. a migration path that can reuse the existing FastAPI endpoints and React-ready component boundaries.

Optimize for clarity and production speed. Avoid decorative gradients, generic dashboard cards and DAW complexity that the product does not need.
