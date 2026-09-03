# Origins canonical product model

This is the Board-approved product constitution. Code, APIs, routes and labels
must converge on it. The current interface is evidence of capabilities, not an
authority for architecture.

```text
Workspace owns.
Explorer places.
Projects group work.
Productions execute creative work.
Library finds.
Creator creates.
Add brings in.
Tools transform.
Files exist.
Objects organize knowledge.
Links associate.
Placements mean actual use.
```

## Workspace and Explorer

`Workspace` is the sole ownership root for Folders, Files, Objects, Projects and
Productions.
It is not another database layer above a Space; there is no Space entity.

Explorer only navigates the Workspace root and its freely named Folders. An
optional `folder_id` places a File, Object, Project or Production. Moving it
changes where it appears, not what it is, who owns it, or where it is used.

## Files, Add and provenance

A `File` is one durable logical Workspace resource. A `FileVersion` is one
immutable physical representation. All current and future formats use this
contract.

`Add` brings an existing resource into the Workspace:

- **Upload** brings a local File.
- **Import** brings a File from an external provider.

FreeSound is an Import provider. Before the operator keeps a FreeSound result it
is temporary external material. Keeping it creates one canonical Workspace File
and preserves `freesound` as provenance detail under the `imported` family.

The only top-level provenance families are `generated`, `uploaded` and
`imported`. Creator creates generated Files. Tools create derived Files. Neither
Upload nor Import is a Creator Capability.

## Library finds

Library is one contextual browser over existing Workspace truth. It neither owns
nor creates resources. Standalone Library, Production Library, Creator references,
Tool inputs and Timeline pickers share one query and filter grammar.

The host supplies initial context, not a new implementation:

```text
scope: This Production | Current Folder | Workspace | Object | Other Production
type:  Image | Video | Audio | Speech | Document | Data | other File kinds
source: Generated | Uploaded | Imported
```

Folders remain Explorer placement. Library can expose Folder scope without
inventing its own folder tree or copying Files. A Production can link a chosen File;
Timeline “Add media” opens Library only.

## Creator creates

Creator is one shared `CreatorHost`, formerly Composer. It is not a family of
pages that happen to look similar.

```text
CreatorHost
├── context
├── allowed capabilities
├── active capability
├── capability navigation
├── model selection
├── execution and candidate state
├── keep-result behavior
├── optional Library for references
└── active CapabilityPanel
```

Human-facing Capabilities are:

```text
Image
Video
Speech
Music
Sound Effect
```

Each Capability panel owns its specialized controls and models. Kling, Alibaba,
Stable Audio and future providers stay behind model declarations and provider
adapters. `Media` may be an internal adapter shared by Image and Video, but it is
never a human-facing Capability, title or shortcut.

Creator can be hosted in a Production module, Script context, modal or standalone
launcher. Geometry may adapt to the host. Capability logic, model selection,
candidate handling, result keeping and Library contracts must not fork.

Creator receives explicit context:

```text
workspace_id   required
folder_id      optional
production_id     optional
production_type   optional
object_id      optional
selection      optional
target         optional
```

Examples:

```text
Workspace Create image      -> CreatorHost, Image active
Script Generate/Edit speech -> CreatorHost, Speech active, Script target
Production Creator Library     -> CreatorHost beside contextual Library
```

A shortcut such as “Create music” selects a Capability in the same CreatorHost.
It is not a separate Music product or implementation.

## Tools transform

Tools are focused transformations of existing Workspace Files. Examples include
Subtitles, Upscale, Remove Background, Convert, Extract Audio and Translate
Subtitles. Silence is an audio Tool, not a Creator intent.

Subtitles illustrates the contract:

1. choose an existing audio or video File through Library;
2. if the source is local, Upload first creates the canonical File;
3. choose the available transcription model;
4. run the Tool through existing ExecutionEngine and Job infrastructure;
5. keep SRT or VTT output as canonical Files;
6. relate outputs to their source with `FileRelation`.

Tools can reuse shared execution UI and provider infrastructure without becoming
Creator Capabilities. Creator and Tools may both use Jobs; sharing machinery does
not merge their product responsibilities.

## Links, relations and placements

There is one canonical File. Contexts point to it without copying it:

- `ProductionFileLink` associates a File with a Production.
- `ObjectFileLink` associates a File with an Object.
- `FileRelation` records derivation or semantic relationships between Files.
- a Production-Type-owned Placement records actual use.

For Audiovisual, `TimelinePlacement` contains timing and source-window data. A
Production link does not imply a Timeline placement, and a relation does not imply
either. Do not call association records `Usage`.

## Objects, Projects and Productions

Objects are durable structured identities such as Brand, Product, Voice and
Citizen. Their media and documents remain canonical Workspace Files connected by
ObjectFileLink.

Projects are human work-grouping containers. A Project groups related Productions
for one initiative, client or campaign. It does not own Files, execute Creator
Capabilities, expose Timeline modules or introduce another ownership root.

```text
Project: Nike Summer Launch
├── Hero Film        [Audiovisual Production]
├── Retail Deck      [Slides Production]
└── Capsule          [Merch Production]
```

Productions are typed creative working environments. A Production can exist
standalone or belong to a Project. `ProductionType` selects modules, allowed
Creator Capabilities, relevant Tools, Library defaults and its Placement kind.
Creating a Production is direct domain creation; it does not pass through
Creator, an ExecutionEngine or a Job.

Audiovisual is the first Production Type consumer, not the platform root. It exposes
Script, Timeline, Creator Library, Preview and Export. “Creator Library” names the
Audiovisual module that composes separate Creator and Library panes; it does not
merge their responsibilities.

## Create is a launcher

`Create` is a human verb that may launch Creator, Add, a Tool, or direct creation
of a Folder, Object, Project or typed Production. It is not a table, superclass,
workflow or technical parent type.

## Execution stays lean

The shared execution vocabulary is:

```text
CreationAction
CreationPreset
ExecutionEngine
Job
temporary candidate
kept File + FileVersion
```

Jobs snapshot resolved parameters and retain existing cost and operation-state
infrastructure. Do not rename or rebuild mature Job machinery for symmetry.

## Non-negotiable boundaries

- No Space entity or Workspace compatibility shell.
- No Project used as a synonym for Production. Project groups work; Production
  executes creative work.
- No `project_id` in `CreatorContext`; Project membership does not change File
  creation or ownership.
- No separate Creator implementations per route, Production or Capability.
- No generic Creator component that imports Speech-, Audiovisual- or
  provider-specific state.
- No shortcut-specific Creator or Library page architecture.
- No subtitles, upscale or other transformation disguised as Creator intent.
- No Add or Import flow owned by a Production-specific API.
- No Library variant with its own resource-query grammar.
- No File copy when another Production or Object references the resource.
- No association named `Usage`; links associate and Placements record use.
- No provider name promoted to a provenance family.
- No deletion of operator-created QA resources without explicit authorization.

## Implementation convergence

Converge one complete path at a time and delete the replaced path:

1. make the shared Creator host genuinely capability-neutral;
2. move Speech, Music and Sound Effect into specialized Capability panels;
3. move Subtitles and other transformations to Tools;
4. unify every Library host on one query/filter contract;
5. move FreeSound keeping to Workspace Import, then optionally link it to context;
6. rename Production/Object association records from Usage to Link;
7. keep actual Timeline use in TimelinePlacement;
8. express Audiovisual through ProductionType configuration rather than generic
   platform conditionals.
9. keep Project as a separate grouping container without moving creative
   execution, Files or ProductionType modules into it.

This order is architectural guidance, not permission to preserve compatibility
bridges. Pre-production schemas may change cleanly, while operator-created Files,
Projects, Productions, Objects and generated or uploaded QA resources remain
protected.
