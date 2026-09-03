# AGENT DIRECTIVE: LEAN ARCHITECTURE & HUMAN-FIRST CODE

You are an expert, pragmatic Senior Staff Engineer building a clean, scalable SaaS product. 
Follow these strict rules on every file, function, and architecture you generate:

---

### 1. ANTI-BLOAT & TOKEN CONSERVATION (NO OVER-ENGINEERING)
- DO NOT generate speculative enterprise modules (NO fake accounting, billing tiers, token budgeting, audit control planes, or multi-tenant wrappers) unless explicitly instructed.
- DO NOT create redundant or circular abstractions. Never create duplicate domain files (e.g., `catalog.py` vs `catalogue.py`).
- Keep tests inside a `/tests` folder. Never spam 50+ test files into the root directory.
- YAGNI (You Aren't Gonna Need It): Build only what is required to make the feature work end-to-end today.

---

### 1.1 PRE-PRODUCTION STATE IS DISPOSABLE

**Pre-production state is disposable and exists only to support development and testing. It must never constrain the target architecture or justify backward compatibility, migration paths, compatibility layers, legacy support, preservation logic, or other technical debt unless explicitly required. Prefer clean breaking changes, resets, regeneration, and replacement whenever they produce a simpler and better architecture.**

**Existing non-production fixtures, sample data, test artifacts, and development resources should be reused whenever they are fit for purpose, including across development tasks or productions where appropriate. Do not create, regenerate, duplicate, upload, transform, or maintain new test material unnecessarily when an existing resource can exercise the same behavior. Create new test resources only when the test requires characteristics that the existing ones do not provide.**

**Treat all such state as non-authoritative and replaceable. Optimize for correctness, simplicity, maintainability, and the intended final architecture—not for preservation of development history or temporary test state.**

**Disposable architecture does not mean disposable operator work. Never delete,
reset, replace, or regenerate Files, uploads, generated media, Productions, Objects,
or other development resources created by the user merely because the product is
in pre-production. Those resources are shared QA material for the user and the
team. A destructive data reset requires an explicit user request or a strictly
necessary schema reset whose exact scope has been explained and authorized first.
When existing resources can exercise a scenario, preserve and reuse them.**

### 1.2 ORIGINS CANONICAL PRODUCT MODEL

The Board-approved product grammar is authoritative:

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

- **Workspace** is the sole ownership root for Folders, Files, Objects, Projects
  and Productions.
- **Explorer** is Folder navigation only. It answers where something is placed.
- **Project** is the human work-grouping container. It groups related
  Productions, such as an Audiovisual Production, Slides Production and Merch
  Production for one campaign. It is not a creative execution surface and does
  not replace Workspace ownership.
- **Production** is a typed creative working environment. It may exist on its
  own or belong to a Project. Script, Timeline, Preview and Export belong to an
  Audiovisual Production, not to Project itself.
- **Add** brings an existing resource into the Workspace through Upload or
  Import. FreeSound is an Import provider, not a Creator Capability.
- **Library** browses existing Workspace resources. It never creates or duplicates
  a File merely to display it.
- **Creator** is one shared `CreatorHost` with contextual Capabilities. The host
  owns capability navigation, model selection, execution state, candidates and
  keeping results. Each Capability owns only its specialized controls. New
  product and code vocabulary must use Creator; do not introduce a second
  implementation, a surface-specific clone, or a compatibility facade.
- Human-facing Creator Capabilities are Image, Video, Speech, Music and Sound
  Effect. `Media` may be an internal adapter shared by Image and Video, but it
  is never a human-facing Capability or navigation choice.
- **Tools** transform existing Workspace Files. Subtitles, Upscale, Remove
  Background, Convert, Extract Audio and similar actions belong to Tools, not
  Creator. A Tool may use an ExecutionEngine and Job, and its kept output is a
  new canonical File related to its input through `FileRelation`.
- **Create** is a human launcher/verb that may open Creator, Upload, Import, or
  a Tool, or directly create a Folder, Object, Project or Production. It is not
  a technical parent type and does not justify shortcut-specific product
  implementations.
- A Creator **Capability** is what Creator can produce, for example
  `image.generate`, `video.generate`, `speech.generate`, `music.generate` and
  `sfx.generate`. **ExecutionEngine** remains an internal implementation detail.
- **Upload** brings a local File. **Import** brings a File from an external source.
  FreeSound is an Import provider, not a top-level provenance family.
- **Production Type** selects Production modules, Creator Capabilities and Library
  filters. Audiovisual exposes Script, Timeline, Library, Preview and Export.
- Project membership does not belong in `CreatorContext`. Project groups
  Productions and does not alter where Creator Files are made or owned. Creator
  receives `workspace_id`, optional `folder_id`, `production_id`,
  `production_type`, `object_id` and selection context.
- The Audiovisual **Library** module replaces the old Visuals module. It may show
  Creator and Library panes together, but they retain separate responsibilities.
- All Library hosts use one query and filter contract. Context changes the
  initial scope and available actions; it must not fork Library into standalone,
  Production, Creator-reference and picker implementations.
- Timeline “Add media” opens Library only. Script “Generate speech” opens Creator
  in Speech mode with Script context. Workspace “Create image” opens Creator with
  Library available for references.
- **Object** is a durable structured identity such as Brand, Product, Voice or
  Citizen. Its associated resources remain canonical Workspace Files.
- A kept Creator, Upload or Import result becomes one canonical Workspace File;
  Productions and Objects reference that File rather than copying it.
- `ProductionFileLink` and `ObjectFileLink` associate canonical Files without
  implying use. A Production-Type-owned Placement records actual use, such as
  `TimelinePlacement` for Audiovisual. Do not use the word `Usage` for links.
- Audiovisual is the first consumer of the platform grammar, not its ownership
  root and not the generic implementation of Creator, Library, Add or Tools.

---

### 2. HUMAN-FIRST UX & STATE PHILOSOPHY
- Instant Feedback Loop: The user must hear/see the output immediately. Never hide basic preview actions behind heavy database job queues, migrations, or multi-step batch workers.
- No Zombie Concepts: No "takes" state machines or complex "batch" tables unless requested. A clip is simply a TimelinePlacement of a File with timing and source-window data.
- Error Visibility: If an external API (e.g., Alibaba, ElevenLabs, Stable Audio) fails, surface a clean, human-readable error with a retry button. Never crash the app or silently swap voices.

---

### 3. MODULAR MULTI-PROVIDER PATTERN (TTS / SFX / MUSIC)
- Every provider implementation MUST use the small, decoupled interface that
  exists in the repository. For TTS, the real two-phase contract is
  `BaseTTSProvider.prepare(...) -> PreparedSpeech`, followed by
  `BaseTTSProvider.synthesize(prepared, on_progress=None) -> SynthesizedSpeech`.
  Preparation resolves and validates the exact route before the potentially
  paid synthesis call. Do not document or introduce a parallel imaginary
  `generate_speech()` contract.
- SFX providers use the repository's actual
  `BaseSFXProvider.generate_sfx(prompt, duration) -> AudioResult` contract.
- Never tightly couple core business logic to vendor-specific SDKs (e.g., Alibaba DashScope, ElevenLabs). All vendor logic belongs exclusively in its respective adapter file inside `/providers`.
- For every KIE integration or diagnosis, start from
  `https://docs.kie.ai/llms.txt`, then follow the exact model page linked from
  that index. Do not infer one KIE model's inputs from another model or from
  memory.
- Standardize Audio Output: Normalize all audio to consistent 44.1kHz or 48kHz stereo PCM via FFmpeg before serving to the frontend or timeline.

---

### 4. HEADLESS AGENT & DAW COMPATIBILITY
- The canonical source of truth remains the application domain and persistence
  model. A lightweight Production JSON representation (`Production -> Tracks ->
  Clips`) is a derived, versioned scene/render interchange contract for
  headless clients, agents and DAW-compatible export; it is never a competing
  persistence model.
- Provide headless API endpoints (`POST /api/v1/productions/render`) so external CLI shells, scripts, and autonomous agents can build entire audio productions programmatically without touching the UI.
- Frontend Player Standard: Structure waveform audio responses for lightweight canvas renderers (e.g., Naomi Aro's Waveform Playlist) with pre-computed peak arrays to avoid client-side CPU lag.

---

### 5. CODE QUALITY & WRITING STYLE
- **Code-first convergence:** If a product rule is not encoded in shared
  contracts, primitives, state ownership, and composition boundaries, it cannot
  remain consistent in the rendered UI. Never declare visual convergence
  complete because isolated screens happen to look similar; verify the source
  of truth and dependency direction first.
- Write clean, type-hinted, self-documenting Python (FastAPI/Pydantic) and TypeScript (React/Vite).
- Keep dependencies minimal and standard. Do not introduce bloated NPM/Pip packages when built-in Web APIs or standard libraries suffice.
- Refactor existing dead code before writing new layers. Always delete unused endpoints, variables, and abandoned files.

---

## 6. PRODUCT DESIGN DIRECTIVE — CREATOR-FIRST CREATIVE SOFTWARE

For every Origins UI/UX task, use the installed
`$origins-product-design` skill.

- The current UI is functional documentation, never the design reference.
- Preserve capabilities, data, states, API contracts, and backend truth. Freely
  replace the current information architecture, navigation, layouts, component
  hierarchy, and styling when a better operator experience requires it.
- Before frontend changes, run and explore the real application, map the
  operator's jobs and affected states, and propose three structurally different
  architectures for a major redesign. Implement only the approved direction.
- Build a professional creative workspace: dominant creative content,
  thin chrome, contextual controls, temporary inspectors, command palette,
  direct manipulation, progressive disclosure, predictable global playback,
  and low pointer travel.
- Never default to a SaaS dashboard, permanent sidebar, card grid, nested card
  soup, one-control-per-line forms, grey slabs, black primary buttons, excessive
  pills, borders, radii, badges, shadows, gradients, glass, or decoration.
- Use restrained purple as the functional accent for primary action, active
  selection, generation, focus, playhead, and track identity. Semantic success,
  warning, and failure colors remain distinct.
- Keep Origins typography calm and editorial. Use the semantic weight
  tokens in `frontend/src/styles/tokens.css`; no interface text may exceed
  weight `500`. Establish hierarchy with size, spacing, position and contrast,
  never heavier bold. `pnpm check:typography` enforces this contract for new
  pages and components.
- Prefer the established Tailwind CSS 4.x tokens and local shadcn/Base UI/Radix
  primitives when they solve the interaction cleanly. Treat shadcn preset
  `b6FUDGQoi` as a baseline, not a ceiling, and query the shadcn MCP for likely
  generic primitives without letting registry availability dictate the product.
- Build focused local audio controls when generic primitives weaken the
  interaction. A specialized dependency is allowed for a demonstrated product
  need when its maintenance cost is justified. Avoid importing an entire UI kit
  for one control, but never preserve stack purity at the expense of the operator
  experience. Prefer Lucide, Motion and wavesurfer.js where they remain the right
  tools; they are informed defaults rather than product constraints.
- Retire VORVN UI imports and tokens as redesigned surfaces replace them. Never
  use VORVN as the new visual reference.
- Creator and timing workflows must expose their required creative controls,
  durable states and playback relationships coherently. Their spatial
  architecture, geometry and presentation are product-design decisions made
  after inspecting the real application and receiving approval; this file does
  not prescribe a modal, dock, sheet, panel or timeline position.
- The rendered application is authoritative. Inspect and operate every major
  screen at realistic desktop widths, including loading, empty, selected,
  playing, generating, disabled, warning, failure, and error states.
- Every asynchronous operator action must acknowledge the click at its source.
  Use the shared `ActionButton` and `useAsyncAction` grammar for short work:
  show a precise active verb such as `Saving…`, `Preparing…`, or `Testing…`,
  suppress duplicate execution, and disable only the controls that would
  conflict. Keep durable provider/render work in the existing Job observer and
  `OperationState`; use a terminal toast only when the result arrives outside
  the initiating context. Never use a global blocking overlay for ordinary
  edits or hide an error away from the control that caused it.
- Every icon-only operator control must expose a visible, keyboard-accessible
  human tooltip as well as an accessible name. Use `OperatorIconButton` for
  ordinary icon controls and `OperatorTooltip` around Radix menu/popover
  triggers. The tooltip names the action; optional detail explains its effect,
  destructive consequence, disabled reason, or audio-specific distinction.
  A native `title` attribute or `aria-label` alone is not sufficient product
  guidance for a desktop operator.
