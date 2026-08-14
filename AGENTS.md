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
- Every AI model MUST inherit from a clean, decoupled base interface:
  - `BaseTTSProvider.generate_speech(text, voice_id, **kwargs) -> AudioResult`
  - `BaseSFXProvider.generate_sfx(prompt, duration) -> AudioResult`
- Never tightly couple core business logic to vendor-specific SDKs (e.g., Alibaba DashScope, ElevenLabs). All vendor logic belongs exclusively in its respective adapter file inside `/providers`.
- Standardize Audio Output: Normalize all audio to consistent 44.1kHz or 48kHz stereo PCM via FFmpeg before serving to the frontend or timeline.

---

### 4. HEADLESS AGENT & DAW COMPATIBILITY
- Single Source of Truth: The entire audio scene must serialize to a lightweight Project JSON format (`Project -> Tracks -> Clips`).
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
- Use Tailwind CSS 4.x and start the new token language from shadcn preset
  `b6FUDGQoi`. Query the shadcn MCP before recreating a generic primitive.
- Use local shadcn/ui plus Base UI/Radix for behavior, Lucide for icons, Motion
  only for purposeful transitions, and wavesurfer.js for genuinely interactive
  waveform/timeline work. Do not add another general UI kit.
- Retire VORVN UI imports and tokens as redesigned surfaces replace them. Never
  use VORVN as the new visual reference.
- Production Composer must become a wide, spatial creative modal with coherent
  script, voice/method, performance, output, cost, state, and primary action.
- Production Timing must become a full-width horizontal bottom workspace that
  expands into a serious timeline editor and collapses without losing context.
- The rendered application is authoritative. Inspect and operate every major
  screen at realistic desktop widths, including loading, empty, selected,
  playing, generating, disabled, warning, failure, and error states.
