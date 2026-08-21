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

### 2. HUMAN-FIRST UX & STATE PHILOSOPHY
- Instant Feedback Loop: The user must hear/see the output immediately. Never hide basic preview actions behind heavy database job queues, migrations, or multi-step batch workers.
- No Zombie Concepts: No "takes" state machines or complex "batch" tables unless requested. A clip is simply an asset with `(start_time, duration, file_url)`.
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
- Standardize Audio Output: Normalize all audio to consistent 44.1kHz or 48kHz stereo PCM via FFmpeg before serving to the frontend or timeline.

---

### 4. HEADLESS AGENT & DAW COMPATIBILITY
- The canonical source of truth remains the application domain and persistence
  model. A lightweight Project JSON representation (`Project -> Tracks ->
  Clips`) is a derived, versioned scene/render interchange contract for
  headless clients, agents and DAW-compatible export; it is never a competing
  persistence model.
- Provide headless API endpoints (`POST /api/v1/projects/render`) so external CLI shells, scripts, and autonomous agents can build entire audio projects programmatically without touching the UI.
- Frontend Player Standard: Structure waveform audio responses for lightweight canvas renderers (e.g., Naomi Aro's Waveform Playlist) with pre-computed peak arrays to avoid client-side CPU lag.

---

### 5. CODE QUALITY & WRITING STYLE
- Write clean, type-hinted, self-documenting Python (FastAPI/Pydantic) and TypeScript (React/Vite).
- Keep dependencies minimal and standard. Do not introduce bloated NPM/Pip packages when built-in Web APIs or standard libraries suffice.
- Refactor existing dead code before writing new layers. Always delete unused endpoints, variables, and abandoned files.

---

## 6. PRODUCT DESIGN DIRECTIVE — CREATOR-FIRST AUDIO SOFTWARE

For every Audio Studio UI/UX task, use the installed
`$audio-studio-product-design` skill.

- The current UI is functional documentation, never the design reference.
- Preserve capabilities, data, states, API contracts, and backend truth. Freely
  replace the current information architecture, navigation, layouts, component
  hierarchy, and styling when a better operator experience requires it.
- Before frontend changes, run and explore the real application, map the
  operator's jobs and affected states, and propose three structurally different
  architectures for a major redesign. Implement only the approved direction.
- Build a professional creative audio workspace: dominant creative content,
  thin chrome, contextual controls, temporary inspectors, command palette,
  direct manipulation, progressive disclosure, predictable global playback,
  and low pointer travel.
- Never default to a SaaS dashboard, permanent sidebar, card grid, nested card
  soup, one-control-per-line forms, grey slabs, black primary buttons, excessive
  pills, borders, radii, badges, shadows, gradients, glass, or decoration.
- Use restrained purple as the functional accent for primary action, active
  selection, generation, focus, playhead, and track identity. Semantic success,
  warning, and failure colors remain distinct.
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
- Composer and timing workflows must expose their required creative controls,
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
