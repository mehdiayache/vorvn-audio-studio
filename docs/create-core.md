# Origins architectural constitution

This document is the canonical reference for Origins domain boundaries. Keep it
concise and update it deliberately when the product model changes.

## Product map

```text
WORKSPACE
│
├── Explorer / Folders
│
├── Projects
│   └── Project
│       ├── Explorer / Folders
│       ├── Production
│       └── Production
│
├── Productions
│   └── may also exist standalone
│
├── Library
├── Objects
├── Creator
├── Add
└── Tools
```

## Canonical grammar

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

## Ownership and placement

Workspace is the ownership root. Files, Folders, Projects, Productions and
Objects belong to a Workspace.

Explorer navigates Folder placement. A Workspace Folder organizes standalone
Workspace resources. A Project Folder organizes resources inside one Project.
A Folder answers where a resource is placed; it does not change what the
resource is or who owns it.

A child Folder shares the Workspace and Project context of its parent. A
standalone Production may only use a Workspace Folder. A Project Production may
only use a Folder from that same Project. Moving a Production between Projects
clears any Folder placement that is not valid in the destination context.

## Projects and Productions

A Project is the master container for a human initiative, campaign or other body
of related work. Its Explorer contains Project Folders and it may group
Productions of different types. The Project itself is a direct child of the
Workspace, never a child of a Folder.

A Production is a typed creative working environment. Audiovisual is one
Production Type; future types may include Slides and Merch. A Production may
belong to a Project or exist standalone.

Project is not Production. Project does not execute creative work and must not
depend on Production-Type internals such as Script, Timeline, Parts, scenes or
future Canvas state.

Project does not own Files, Creator, Library or Timeline. Deleting a Project
must leave its Productions and Workspace Files intact; membership is removed,
not the work itself.

## Files, Creator, Library, Add and Tools

A File is a canonical Workspace resource. Productions and Objects reference or
use that File; they do not create private copies merely to access it.

Creator creates Workspace Files. Its execution context may include Workspace,
Folder, Production, Production Type, Object and selection information. Project
membership does not affect File creation, so `CreatorContext` must not contain
`project_id` or discover a Project implicitly.

Library finds existing Workspace Files. Context may change its initial scope or
available actions, but not its ownership model or query meaning.

Add brings existing material into the Workspace through actions such as Upload
or Import. Tools transform existing Workspace Files and keep resulting outputs
as Workspace Files.

## Links and Placements

A Link associates one canonical File with a Production or Object. Association
does not prove that the File is actively used.

A Placement records actual use inside a Production-Type-owned structure. A
Timeline Placement is the Audiovisual example; future Production Types may use
different Placement structures.

Therefore:

```text
File ownership      → Workspace
Folder location     → Explorer placement
Project context     → human work container
File association    → Link
Actual creative use → Placement
```
