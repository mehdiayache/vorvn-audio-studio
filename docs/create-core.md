# Origins canonical product model

This document is the Board-approved constitution for Origins. It defines the
product grammar and the boundaries that code, APIs and interface labels must
converge on.

```text
Explorer places.
Library finds.
Creator creates.
Files exist.
Objects organize knowledge.
Projects organize work.
Capabilities extend Creator.
Workspace owns everything.
```

## Workspace owns the world

`Workspace` is the sole business and ownership root:

```text
Workspace
├── Folders
├── Files
├── Objects
└── Projects
```

There is no Space above or below it. A File, Object or Project belongs to one
Workspace and may have an optional `folder_id`. A null `folder_id` means the
Workspace root. Moving something changes only its Explorer placement; it never
changes its identity, content or uses.

## Explorer places

Explorer answers one question: **where is this thing placed?**

Explorer displays the Workspace root and its freely named Folder hierarchy.
Files, Objects and Projects may appear together in any Folder. Explorer does
not classify media, generate content, own Files or define a Project's behavior.

## Files exist

A `File` is one durable logical Workspace resource. A `FileVersion` is one
immutable physical representation of it. PNG, SVG, MP3, WAV, MP4, SRT, JSON,
PDF, TXT, CSV and future formats all follow the same rule.

A File can arrive through:

- **Creator** — generate or transform something;
- **Upload** — bring a local File;
- **Import** — bring a File from an external provider such as FreeSound.

The top-level provenance families are `generated`, `uploaded` and `imported`.
Provider identity such as `freesound` is preserved as provenance detail under
`imported`, not promoted to another top-level family.

Keeping a result creates one canonical File and FileVersion. Projects and
Objects reference that File; they do not copy it. `ProjectFileUsage` associates
a File with a Project. `TimelinePlacement` separately places a used File in
time. Association never implies Timeline placement.

## Library finds

Library answers: **what can I use?** It is a contextual view over existing
Workspace truth and never an ownership container.

Context scopes may include:

```text
This Project
Current Folder
Workspace
Brands
Products
Citizens
Voices
Other Projects
```

Resource filters may include:

```text
All
Images
Videos
Audio
Documents
Data
```

Provenance filters are:

```text
Generated
Uploaded
Imported
```

Library may run by itself when the intent is to pick something. Timeline
“Add media” therefore opens Library only.

## Creator creates

`Creator` is the one universal creation machine, evolved from the mature
Director Composer. `Composer` is no longer the canonical product or code name.
There must not be parallel media, speech or audio creation systems hidden behind
different product surfaces.

Creator begins with intent:

```text
Image
Video
Speech
Music
Sound Effect
```

Future intents such as Silence, JSON, 3D, Animation, Voice transformation,
structured data or Citizen definition extend the same Creator.

Creator may appear in a Project, in Library, in Script, from Explorer or in a
modal. Presentation can change; the Creator implementation and contracts do
not fork. Library may be docked beside Creator to select existing references,
but their responsibilities remain separate.

Creator receives explicit context:

```text
workspace_id   required
folder_id      optional
project_id     optional
project_type   optional
object_id      optional
selection      optional
```

Context constrains available Capabilities, supplies current selections and
controls where a kept File is placed or referenced.

## Capabilities extend Creator

A `Capability` is something Creator knows how to produce or transform:

```text
image.generate
video.generate
speech.generate
music.generate
sfx.generate
```

Later Capabilities may include:

```text
silence.create
subtitle.create
image.edit
video.extend
audio.clean
json.generate
citizen.generate
```

Models declare which Capabilities they support. Creator reads those declarations
to expose compatible inputs, references, operations, ratios, resolutions,
durations, frame rates and parameters.

`ExecutionEngine` is internal provider-neutral execution machinery. Provider
adapters translate only vendor details. The operator chooses a Capability and,
when useful, a Model—not an Engine.

The existing technical records remain lean:

```text
Capability / CreationAction
optional CreationPreset
ExecutionEngine
Job
temporary candidate
kept File + FileVersion
```

`CreationAction` is a launchable internal action for a Capability; it is not a
second product concept. `CreationPreset` supplies named defaults. Jobs snapshot
resolved values. Direct creation of a Folder, Object or Project does not pass
through an Engine or Job.

## Create is a human launcher

`Create` can mix choices in the interface without merging them in the domain:

- launch Creator for Image, Video, Speech, Music or Sound Effect;
- Upload a local File;
- Import from FreeSound or another external provider;
- create a Folder, Object or typed Project directly.

Create is a verb and navigation entry, not a persistence entity or universal
technical operation.

## Objects organize knowledge

An `Object` is a durable structured identity. Initial Object Types include:

```text
Brand
Product
Voice
Citizen
```

Objects describe meaning and roles while their media and documents remain
canonical Workspace Files. A Brand can identify its primary logo and guidelines;
a Product can identify its images and data; a Voice can identify its source
recording, portrait and notes; a Citizen can identify its profile, voice and
references.

Library exposes Object-centered paths so a Project can find related Files
without forcing the operator to remember their Folder locations.

## Projects organize work

A `Project` is a typed, rich working environment. It belongs to the Workspace
and has an Explorer placement. A `ProjectType` selects its modules, Creator
Capabilities, Library filters and domain behaviors.

Examples include Audiovisual, Merch, Slides and Book. Project Type does not
create another ownership root or duplicate generic Workspace services.

### Audiovisual

The canonical modules are:

```text
Script
Timeline
Library
Preview
Export
```

Its Creator Capabilities are Image, Video, Speech, Music and Sound Effect.
The former `Visuals` module becomes `Library`; images and videos are media
filters inside Library, not the module's identity.

The full Project Library surface may compose two panes:

```text
┌──────────────────────┬──────────────────────┐
│       Creator        │       Library        │
│                      │                      │
│ Image                │ This Project         │
│ Video                │ Current Folder       │
│ Speech               │ Workspace            │
│ Music                │ Brands               │
│ Sound Effect         │ Products             │
│                      │ Other Projects       │
└──────────────────────┴──────────────────────┘
```

Contextual actions preserve intent:

```text
Timeline → Add media       = Library picker
Script → Generate speech   = Creator, Speech mode, current Script target
Workspace → Create image   = Creator, Image mode, Library for references
```

## Non-negotiable architecture rules

- No Space entity, legacy compatibility layer or parallel persistence model.
- No automatic Folder taxonomy for Generated, Uploaded or Imported resources.
- No duplicate File when another Project or Object uses the same resource.
- No Creator behavior inside Library; Library may host the Creator pane but
  still only browses existing truth.
- No provider name as a top-level provenance family.
- No Project creation through the Capability/Engine/Job pipeline.
- No automatic deletion of user-created development Files or Projects. The
  pre-production rule permits clean schema evolution; it is not authorization
  to erase shared QA material.
- Preserve mature Audiovisual behavior while changing its module vocabulary and
  resource architecture.

## Implementation convergence

The codebase must now converge in this order:

1. Preserve Workspace, Folder, File and Project ownership already implemented.
2. Rename the universal Composer contract and code to Creator without a bridge.
3. Normalize provenance to Generated, Uploaded and Imported while retaining
   provider detail such as FreeSound.
4. Replace the Audiovisual Visuals module with contextual Library.
5. Bring Speech, Music and Sound Effect into the same Creator capability system.
6. Make standalone and Project Library share one query/filter grammar.
7. Introduce Object and ObjectFileUsage for Brand, Product, Voice and Citizen.
8. Add Project Types only when a real end-to-end workflow requires them.
