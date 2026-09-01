# Create core constitution

This repository is the temporary laboratory for the application's creative
core. The current development data is disposable. Mature generation,
playback, editing, provenance, cost and Job behavior must survive the cutover;
the old Venture → Work Project → Series → Production hierarchy must not.

## Domain root

`Space` is the root of the current local domain.

`Workspace` may describe an application shell or a frontend component. It is
not a database table, an ownership boundary or a parent of Space.

The persistent user-facing concepts are:

- **Space** — the boundary in which Files and Projects can be reused.
- **Folder** — optional, user-authored organization only.
- **Project** — typed, editable work with a specialized interface.
- **File** — one durable logical result, independent of its location or uses.
- **FileVersion** — one immutable physical representation of a File.
- **Job** — the existing durable execution record.

## Create is an interface, not a domain parent

`Create` may present heterogeneous choices together:

- generate an image;
- generate music;
- create subtitles;
- upload a File;
- create an audiovisual Project;
- create a Folder.

Only durable execution work uses the creation registry:

`CreationAction → optional CreationPreset → ExecutionEngine → Job → Files`

Creating a Project or Folder remains a direct domain command. Uploading a File
uses a Job only when durable processing is actually required.

## Creation contracts

A `CreationAction` declares a launchable operation: its inputs, parameters,
possible output MIME types, Engine and supported context. The initial visible
actions are not a closed technical enum.

A `CreationPreset` applies named defaults and constraints to one Action. It
does not own an Engine, Job or File. Jobs snapshot the resolved preset values
so editing a Preset never rewrites history.

An `ExecutionEngine` is the internal adapter that performs an Action. It may
call a provider, an internal service, FFmpeg, an n8n workflow or an agent. This
is an internal registry, not a marketplace or public plugin SDK.

Simple Action schemas may use shared controls. Complex Actions keep a focused
Composer. A shared registry must never force every workflow into one generic
form.

## Files

MIME type is the technical truth. Audio, image, video, subtitle, document,
archive and data are presentation families derived from MIME type, never a
closed output constraint.

Moving a File between Folders must not change its storage key or break a
Project. A Project references a File through `ProjectFile`. A Timeline uses a
File through a separate `TimelinePlacement`; associating a File with a Project
never places it automatically.

## Typed Projects

The first Project type is `audiovisual`. Its mature Script, Timeline, Viewer,
playback, inspectors, gestures, scene documents and rendering behavior are a
protected baseline.

The current Director boundary is decomposed:

- generation becomes Create/Creation Actions;
- collected media becomes Project Files;
- Timeline placement remains an explicit audiovisual command.

Future Project types may provide specialized interfaces and context, but they
reuse Files, Jobs and Creation Actions. No generic Project-type SDK is built
until at least two real Project types prove the shared contract.

## Cutover rules

- Development/demo rows may be reset instead of backfilled.
- Preserve mature capabilities and invariants, not legacy names.
- Do not add permanent compatibility routes or parallel domain models.
- The old Work hierarchy and the Space-first path stay isolated while old
  screens are removed; new writes never mirror, backfill or preserve old rows.
- Boundary adapters may translate storage details, but they must never create
  a second owner, compatibility row or legacy write path.
- Generated, Uploaded, Audio, Image and Video are smart views, not automatic
  Folders.
- The application opens on the current Space with Create dominant and Recent,
  Projects, Files and Folders available around it.
