# Canonical Audio Studio domain

```text
Venture
└── Project
    ├── Series (optional)
    │   └── Production
    └── Production
        └── ProductionPart
            └── Take
```

## Responsibilities

- **Venture** is the durable brand, policy, asset, voice and accounting scope.
- **Project** is a focused production initiative inside one Venture.
- **Series** is an optional editorial grouping. It owns defaults, never Parts.
- **Production** is the editable audio document. It owns sequence, mix and exports.
- **ProductionPart** is an ordered speech, silence or linked-asset source.
- **Take** is a paid or recorded version of one Part.

A Production can live directly in a Project. A Production assigned to a Series
must belong to the same Project as that Series.

## Physical storage

| Domain resource | Canonical table |
| --- | --- |
| Venture | `ventures` |
| Project | `work_projects` |
| Series | `series` |
| Production | `productions` |
| Part ownership | `production_parts` |
| Production music | `production_mixes` |
| Venture asset collection | `asset_collections` |

The old `projects` table remains a compatibility projection while legacy tools
migrate. It is not the domain model. Triggers synchronize legacy writes into
canonical resources. Existing Venture, Project and Production integer IDs are
preserved, as are every Generation ID and audio filename.

## Routes

```text
/audio-studio/                         Venture directory
/audio-studio/ventures/:id            Venture
/audio-studio/projects/:id            Project
/audio-studio/series/:id              Series
/audio-studio/productions/:id         Production editor
```

`/studio/*`, `/audio-studio/workspaces/:id` and `?tab=projects&project=:id` are redirect-only
compatibility paths. New code must not generate them.

## Migration boundary

All product reads, edits and paid-operation submissions use `/api/v1`. The
worker may temporarily execute an Alibaba operation through the loopback
provider adapter, but that implementation detail is not an application route.
Database triggers maintain `generations.production_id`, `production_parts`,
and Job scope automatically.

No React component should know that a canonical Production still has a
`legacy_container_id`. That field exists only in the editor adapter until all
media functions accept `production_id` directly.

## Integrity gate

Run after every database migration:

```bash
.venv/bin/python check_domain.py
```

Schema changes remain additive until old clients are retired. Do not remove
`projects`, `generations.project_id`, or compatibility triggers merely because
the React UI no longer reads them.
