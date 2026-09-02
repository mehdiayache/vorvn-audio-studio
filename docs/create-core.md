# Origins core constitution

Origins is the application's creative core. Development data is disposable;
the target architecture is authoritative and does not preserve superseded
paths.

## Workspace is the ownership root

`Workspace` is the sole business root:

```text
Workspace
├── Folders
├── Files
├── Objects
└── Projects
```

The persistent user-facing concepts are:

- **Workspace** — the boundary in which Files, Objects and Projects are reused.
- **Folder** — optional human organization inside a Workspace.
- **Project** — typed, editable work with a specialized interface.
- **Object** — reusable structured identity such as a Brand or Product.
- **File** — one durable logical result, independent of location and uses.
- **FileVersion** — one immutable physical representation of a File.
- **Job** — the existing durable execution record.

Every File, Object and Project has a required `workspace_id` and an optional
`folder_id`. Moving it changes only `folder_id`.

## Explorer and Library

Explorer answers “Where is it?” and owns the human Folder hierarchy. Library
answers “What can I use?” by querying the whole Workspace. Library is a view;
it never owns or duplicates Files.

Library may filter by Files, Objects, Projects, Folders, media family, source
and relationships such as Brand → Files or Project → Files.

## Create is an interface, not a domain parent

`Create` may present heterogeneous choices together:

- create a Folder, Object or typed Project directly;
- upload a File directly;
- launch image, video, speech, music, sound-effect or subtitle creation.

Only durable execution work uses the creation registry:

`CreationAction → optional CreationPreset → ExecutionEngine → Job → candidate`

Creating a Project, Object or Folder never passes through an Engine or Job.
Uploading a File uses a Job only when durable processing is actually required.

## Universal Composer

Composer is one surface driven by model capabilities. It begins with the
operator's intended output and then exposes only the selected model's supported
operations, inputs, references, ratios, resolutions, durations, frame rates
and parameters.

Composer receives one explicit `ComposerContext`:

```text
workspace_id   required
folder_id      optional
project_id     optional
project_type   optional
object_id      optional
selection      optional
```

Context filters capabilities and controls where a kept result is linked. It
does not fork Composer into separate implementations.

## Creation contracts

A `CreationAction` declares a launchable operation, accepted inputs, parameters,
possible output MIME types, Execution Engine and supported context. The visible
actions are not a closed technical enum.

A `CreationPreset` applies named defaults and constraints to one Action. It
does not own an Engine, Job or File. Jobs snapshot resolved preset values so a
later Preset edit never rewrites history.

An `ExecutionEngine` is the internal adapter that performs an Action through a
provider, internal service, FFmpeg, workflow or agent. It is not a marketplace
or public plugin SDK.

Simple Action schemas may use shared controls. Complex Actions keep focused
controls without creating another Composer.

## Files and usage

MIME type is technical truth. Audio, image, video, subtitle, document, archive
and data are presentation families derived from MIME type.

A successful run first produces a temporary candidate. Keeping it creates one
canonical File and FileVersion in the Workspace. Context may place the File in
the current Folder and link it through `ProjectFileUsage` or, later,
`ObjectFileUsage`.

A Project association never places a File on a Timeline. Timeline placement is
a separate `TimelinePlacement` command.

## Typed Projects

The first Project type is `audiovisual`. Its mature Script, Sequence, Timeline,
playback, speech, Visuals, captions, Preview and Export behavior is a protected
baseline owned under `projects/audiovisual`.

A Project Type config declares its modules and allowed Composer capabilities.
Origins contributes contextual Create and Library entries to every Project.
Additional Project Types reuse Workspaces, Files, Jobs, Composer and creation
contracts without forcing their specialized editors into a generic SDK.

## Architecture rules

- Development rows may be reset instead of backfilled.
- Preserve mature capabilities and invariants under canonical Origins names.
- Do not add compatibility aliases, routes, rows or parallel domain models.
- Adapters may translate external provider and storage details only.
- Generated, Uploaded, Images, Video and Audio are smart views, not automatic
  Folders.
- Origins opens on the current Workspace with Create dominant and Recent,
  Projects, Files and Folders available around it.

## Implementation order

1. Canonical vocabulary in DB, backend, API, frontend, files and tests.
2. Workspace, Explorer, Folder and File truth.
3. Universal Composer and explicit context.
4. Audiovisual as the first typed Project.
5. Project modules and contextual rail.
6. Universal Library.
7. Objects.
8. Additional Project Types proven one at a time.
