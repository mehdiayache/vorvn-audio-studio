"""Small, provider-neutral contracts behind the Create interface."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


CreationFieldType = Literal[
    "text", "number", "boolean", "choice", "file", "files",
]


@dataclass(frozen=True, slots=True)
class CreationField:
    id: str
    label: str
    type: CreationFieldType
    required: bool = False
    choices: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.id.strip() or not self.label.strip():
            raise ValueError("Creation fields require an ID and label.")
        if self.type == "choice" and not self.choices:
            raise ValueError("Choice fields require at least one choice.")
        if self.type != "choice" and self.choices:
            raise ValueError("Only choice fields may declare choices.")


@dataclass(frozen=True, slots=True)
class CreationAction:
    id: str
    label: str
    description: str
    engine_id: str
    capability_id: str
    inputs: tuple[CreationField, ...] = ()
    parameters: tuple[CreationField, ...] = ()
    output_mime_types: tuple[str, ...] = ()
    supported_contexts: tuple[str, ...] = ("workspace",)

    def __post_init__(self) -> None:
        if not self.id.strip() or not self.label.strip():
            raise ValueError("Creation actions require an ID and label.")
        if not self.engine_id.strip():
            raise ValueError("Creation actions require an execution Engine.")
        if not self.capability_id.strip():
            raise ValueError("Creation actions require a Capability ID.")
        if not self.output_mime_types:
            raise ValueError("Creation actions require at least one output MIME type.")
        if not self.supported_contexts:
            raise ValueError("Creation actions require at least one supported context.")
        field_ids = [field.id for field in (*self.inputs, *self.parameters)]
        if len(field_ids) != len(set(field_ids)):
            raise ValueError("Creation input and parameter IDs must be unique.")


@dataclass(frozen=True, slots=True)
class CreationPreset:
    id: str
    action_id: str
    label: str
    values: dict[str, Any] = field(default_factory=dict)
    locked_fields: frozenset[str] = frozenset()
    version: int = 1

    def __post_init__(self) -> None:
        if not self.id.strip() or not self.action_id.strip() or not self.label.strip():
            raise ValueError("Creation presets require IDs and a label.")
        if self.version < 1:
            raise ValueError("Creation preset versions start at 1.")
        if not self.locked_fields.issubset(self.values):
            raise ValueError("Locked preset fields must have resolved values.")


@dataclass(frozen=True, slots=True)
class CreationContext:
    workspace_id: int
    folder_id: int | None = None
    project_id: int | None = None
    project_type: str | None = None
    object_id: int | None = None
    selection: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.workspace_id < 1:
            raise ValueError("Creation context requires a Workspace.")
        if self.folder_id is not None and self.folder_id < 1:
            raise ValueError("Folder IDs must be positive.")
        if self.project_id is not None and self.project_id < 1:
            raise ValueError("Project IDs must be positive.")
        if self.project_type is not None and not self.project_type.strip():
            raise ValueError("Project types cannot be empty.")
        if self.object_id is not None and self.object_id < 1:
            raise ValueError("Object IDs must be positive.")


@dataclass(frozen=True, slots=True)
class CreationResult:
    output_file_ids: tuple[int, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)


class ExecutionEngine(Protocol):
    id: str

    def execute(
        self,
        action: CreationAction,
        *,
        inputs: dict[str, Any],
        parameters: dict[str, Any],
        context: CreationContext,
    ) -> CreationResult: ...


class CreationRegistry:
    """Deliberately small internal registry, not a plugin framework."""

    def __init__(self) -> None:
        self._actions: dict[str, CreationAction] = {}
        self._presets: dict[str, CreationPreset] = {}
        self._engines: dict[str, ExecutionEngine] = {}

    def register_engine(self, engine: ExecutionEngine) -> None:
        if engine.id in self._engines:
            raise ValueError(f"Execution Engine {engine.id!r} is already registered.")
        self._engines[engine.id] = engine

    def register_action(self, action: CreationAction) -> None:
        if action.id in self._actions:
            raise ValueError(f"Creation Action {action.id!r} is already registered.")
        self._actions[action.id] = action

    def register_preset(self, preset: CreationPreset) -> None:
        if preset.id in self._presets:
            raise ValueError(f"Creation Preset {preset.id!r} is already registered.")
        if preset.action_id not in self._actions:
            raise ValueError("Creation Presets require a registered Action.")
        action = self._actions[preset.action_id]
        field_ids = {field.id for field in (*action.inputs, *action.parameters)}
        unknown = set(preset.values) - field_ids
        if unknown:
            raise ValueError(
                "Creation Preset contains unknown fields: "
                + ", ".join(sorted(unknown)))
        self._presets[preset.id] = preset

    def actions(self, context: str = "workspace") -> tuple[CreationAction, ...]:
        return tuple(
            action for action in self._actions.values()
            if context in action.supported_contexts
        )

    def action(self, action_id: str) -> CreationAction:
        try:
            return self._actions[action_id]
        except KeyError as exc:
            raise LookupError("That Creation Action is not available.") from exc

    def preset(self, preset_id: str) -> CreationPreset:
        try:
            return self._presets[preset_id]
        except KeyError as exc:
            raise LookupError("That Creation Preset is not available.") from exc

    def engine_for(self, action: CreationAction) -> ExecutionEngine:
        try:
            return self._engines[action.engine_id]
        except KeyError as exc:
            raise LookupError("That Creation Action's Engine is unavailable.") from exc
