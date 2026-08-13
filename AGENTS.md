# Audio Studio repository instructions

## Architecture

Keep the application modular and easy to change.

Every important responsibility has one clear owner.

Keep React UI, application logic, persistence, provider integrations,
configuration, and API contracts clearly separated.

Prefer existing architecture and components over creating parallel systems.

New code must follow the new architecture. Do not introduce new dependencies
on legacy `server.py`, legacy `db.py` patterns, or the old UI.

Avoid premature abstraction and unnecessary architectural complexity. This is
a developing product, not a distributed enterprise system.

## UI / UX quality gate — permanent instruction

This repository is a product interface, not a backend with controls attached.

Passing tests does not mean UI work is complete.

For every user-facing component or screen modified, visual and interaction
quality is a first-class acceptance criterion.

Agents must behave as both:

- senior product engineers;
- senior desktop product-interface designers.

Do not translate requirements literally into one chip, label, row, badge, or
box per fact.

The responsibility is to compose information, establish hierarchy, reduce
visual noise, and create an interface that is fast and comfortable for repeated
professional use.

### Precedence

For visual composition, density, hierarchy, interaction quality, and UI
acceptance, this quality gate is the repository authority. If older visual
guidance, an existing implementation, or a mechanically literal reading of a
design note conflicts with this gate, follow this gate and remove or update the
contradictory visual guidance. Do not preserve a poor UI merely because it
already exists or because a requirement can be represented literally.

Product/domain invariants, data truth, API contracts, and the authorized scope
remain authoritative for behavior. This UI gate does not authorize Origins
shell integration, mobile redesign, or work outside the active scope.

### Mandatory visual workflow

For any significant UI component:

1. Inspect the actual rendered interface before changing it.
2. Understand the user's primary task and scanning order.
3. Inspect relevant existing shadcn components and patterns through the
   available shadcn MCP before inventing custom UI.
4. Reuse shadcn, Radix, and Tailwind composition patterns where they provide a
   better established solution.
5. Implement.
6. Render the real served application with realistic data.
7. Capture and review the actual result at the primary desktop width.
8. Critique the UI adversarially.
9. Iterate until the visual hierarchy and interaction quality are genuinely
   strong.
10. Only then run final acceptance and report completion.

Never declare UI work complete from source inspection, unit tests, DOM
measurements, zero overflow, or console cleanliness alone.

Those prove correctness. They do not prove product quality.

### Mandatory desktop product-design principles

The current Production v2 program is desktop professional software.

Optimize first for:

1. 1440 px as the primary working reference;
2. then 1280, 1600, and 1920 px.

Do not spend design effort on mobile unless explicitly authorized.

The interface should feel closer in discipline to high-quality creative and
productivity software than to a generic SaaS dashboard.

Favor:

- strong typographic hierarchy;
- spatial consistency;
- compact but comfortable density;
- whitespace with purpose;
- calm neutral surfaces;
- fewer boxes;
- fewer badges;
- fewer borders;
- progressive disclosure;
- stable object anatomy;
- predictable action placement;
- obvious primary actions;
- intelligent hover and focus disclosure;
- technical information that is legible rather than hidden.

Avoid:

- card soup;
- dashboard-style rectangles for every object;
- one badge for every state;
- excessive chips;
- metadata sentences separated only by bullets;
- huge dead areas;
- controls floating inside reading content;
- arbitrary icons;
- UI built by literally exposing every backend field;
- visual density that changes wildly across states;
- generic AI-generated admin layouts.

### Color grammar — mandatory

Color is product grammar, not decoration. Every color must have one stable,
explainable job, and the same meaning must remain consistent across screens and
states.

Use this hierarchy:

- neutral canvas, surfaces, borders, and text carry structure and hierarchy;
- the default interactive accent is near-black with a white foreground;
- green means success, healthy, ready, online, or completed;
- amber means warning, attention, stale, confirmation, or review needed;
- red means error, failure, destructive action, missing critical data, or a
  critical state;
- blue/info means neutral information that requires notice but is neither
  success nor failure;
- Cast, chart, media, avatar, swatch, and other categorical colors use their
  dedicated component/data roles and never borrow semantic status colors.

Accent and status are separate systems. Accent profiles may affect primary
interactive actions and their foreground, but must never redefine success,
warning, danger, or information. Ordinary menu, tab, navigation, row, and card
selection should remain neutral unless a specific semantic state requires
color.

Implementation rules:

- consume semantic VORVN or existing application tokens only;
- never introduce raw hex, RGB, HSL, OKLCH, arbitrary Tailwind color values, or
  component-local palette variables in product UI;
- if a needed role does not exist, add one at the owned token/foundation layer
  after validating that it represents a reusable semantic role;
- do not use color as the only state signal; pair it with clear text, icon,
  shape, or position as appropriate;
- do not tint a whole card merely because one nested fact has a state;
- do not make the quiet Ready state green by default; reserve strong semantic
  color for information the operator must notice;
- use small, controlled semantic accents before large colored surfaces;
- use typography, spacing, and contrast for hierarchy before adding hue;
- Cast identity color should behave as a restrained identity marker, not as a
  competing status or a full-card theme;
- data-series colors must remain distinguishable from success, warning, and
  danger;
- hover, active, selected, disabled, focus, and destructive states must remain
  visually distinct without changing the meaning of their semantic color;
- verify foreground/background contrast and visible keyboard focus in the real
  rendered state, including dimmed, selected, disabled, and Workbench-narrowed
  compositions.

During visual review, explicitly ask:

- What does each non-neutral color mean?
- Is that meaning reused consistently elsewhere?
- Did accent color accidentally become status color?
- Is the interface understandable without relying on color alone?
- Can any colored region return to neutral without losing meaning?

If a non-neutral color has no precise semantic answer, remove it.

### Information hierarchy rule

Before building a component, explicitly identify:

- **Primary:** What must the operator understand in under one second?
- **Secondary:** What supports the current task but must not compete visually?
- **Tertiary:** What belongs on hover, disclosure, Workbench, tooltip, menu, or
  technical details?

Do not give all three levels equal weight.

### Repeated-component rule

Components used dozens or hundreds of times per session require more design
discipline than occasional screens.

For repeated objects such as Speech Parts:

- optimize scanability across 10–100 consecutive instances;
- keep the common Ready state quiet;
- make exceptional states add information instead of permanently reserving
  large empty UI;
- avoid unnecessary minimum heights;
- preserve identity and key truth while active operations occur;
- use typography and alignment before introducing another badge or box.

Always render several consecutive real objects together before accepting the
design.

A component that looks acceptable alone may be unacceptable repeated 20 times.

### Shadcn MCP rule

The shadcn MCP must be used proactively for UI work.

Before inventing a custom interaction or structure:

- inspect the most relevant shadcn components and examples;
- inspect composition patterns, not only primitive APIs;
- reuse proven component behavior;
- adapt styling to VORVN tokens and Audio Studio.

Do not blindly copy shadcn demos. Use shadcn as a high-quality interaction and
component vocabulary, composed for Audio Studio. Inspect existing local
primitives first, query shadcn before creating or recreating a generic
primitive, and use the shadcn audit checklist after adding component code.

### Native OpenAI Codex Skills rule

Use the native OpenAI Codex Skills already available in the active session by
default whenever the task matches their declared purpose. Skills are execution
contracts, not optional inspiration.

Before beginning a substantial task:

1. Inspect the Skills available to the current Codex session.
2. Select the smallest relevant set whose trigger and description match the
   task.
3. Read each selected `SKILL.md` completely before taking task actions.
4. Follow its workflow, required references, capture steps, verification, and
   handoff rules faithfully.
5. State which Skill is being used and why.

For UI and product-interface work in this repository:

- use the available Product Design Skill to route significant design,
  implementation, critique, or audit work;
- use its audit workflow for visual/interaction quality reviews rather than
  substituting a source-only code review;
- use the Browser Skill to inspect and interact with the real served
  application, capture rendered states, and verify the primary workflow;
- use image-to-code when a selected screenshot or mockup is the actual visual
  target;
- use ImageGen when a required visual asset is missing and an original generated
  asset is appropriate;
- use specialized document, PDF, spreadsheet, presentation, GitHub, or other
  available Skills when the requested artifact or workflow matches them.

Do not manually approximate a matching Skill's workflow, silently skip it, or
claim it is unavailable without checking the active Skill list. Do not invoke
unrelated Skills merely because they exist. A Skill does not broaden the active
product scope, override repository/domain truth, or authorize deployment,
external writes, paid calls, or destructive actions except where the active
task or the permanent Real Human Product QA permission below explicitly grants
that authority.

### UI VORVN grounding

Use UI VORVN as the mature visual and interaction reference:

- Registry: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/src/registry/ui-vorvn.registry.json`
- Runnable catalog: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/components/index.html`
- Foundation tokens: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/src/foundation/tokens.css`
- Foundation guidance: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/docs/FOUNDATION_V1.md`
- Typography guidance: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/docs/TYPOGRAPHY_V1.md`
- Media and voice guidance: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/docs/MEDIA_VIDEO_AND_VOICE.md`
- Media contract: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/src/patterns/media-contract.js`
- Runnable media implementation: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/components/media.js`
- Runnable media styles: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/components/media.css`

Interpret registry status deliberately:

- `reference` is established precedent;
- `candidate` is inspiration requiring validation in Audio Studio;
- `fixture` is demonstration only;
- rejected labs and prototypes must never be used.

Translate relevant precedent into the existing React architecture and semantic
VORVN token system. Do not copy catalog HTML/CSS literally or introduce a
parallel UI system.

### Visual self-review questions

Before marking any UI scope complete, ask:

- Where does my eye look first?
- Is that the correct thing?
- Can I understand the object in one second?
- Did I create UI merely because a backend fact exists?
- Can two labels become one better hierarchy?
- Can typography replace a chip?
- Can alignment replace another box?
- Does the common state feel calm?
- Does the exceptional state remain clear?
- Is there dead space?
- Are actions interfering with reading?
- Does long text still work?
- Does the component still look good repeated 10–20 times?
- Does narrowing the Canvas with the Workbench destroy important information?
- Would a professional operator want to stare at this for four hours?

If any answer is poor, iterate before reporting completion.

### Founder review is not the first visual QA stage

Do not rely on the founder to discover basic hierarchy, density, clipping,
layout, or visual-composition problems after completion.

The agent's own visual QA must catch these first. Founder review should evaluate
product direction and final quality, not perform the first design critique.

### Real Human Product QA — permanent permission

For Audio Studio product and UI work, automated tests, source inspection, DOM
snapshots, screenshots, console cleanliness, and geometry measurements are not
sufficient acceptance evidence. Agents are explicitly authorized and required
to perform real exploratory human QA against the served application.

#### Living QA Production

Use the existing Production named **Test Production of Conversation** as the
primary persistent product-testing workspace.

Do not recreate a fresh empty Production for every UI scope unless a specific
clean-state test requires it. Build this Production into a useful long-lived QA
corpus over time. Reuse realistic state that already exercises the scenario.

Agents may create and retain representative test state there, including:

- short Speech Parts;
- long Speech Parts and very long multi-paragraph narration;
- Original, Spoken, and Tagged text variants;
- expressive scripts using many route-supported delivery tags;
- multiple Takes;
- different existing Voice Identities and exact provider routes;
- Direct Voice Parts;
- Cast Roles and natural multi-character dialogue;
- captions, transcriptions, and caption translations;
- Silence;
- linked Venture audio;
- Music Bed;
- preview and export state.

Do not automatically clean representative state after QA. Persistent realistic
state is a product-testing asset because future scopes must be judged against a
mature Production, not only empty fixtures.

Human QA authority is unrestricted only inside designated QA/test resources.
Do not mutate real business Productions. Never delete the Living QA Production.
Do not mass-create Voice Identities or provider clones unless the feature under
test specifically requires them. Clearly identify QA-only Venture assets,
Personas, or other reusable resources created for testing.

#### Paid provider QA

Real provider calls are explicitly permitted when they materially improve
product verification. An agent may spend up to USD $5 equivalent per deliberate
QA pass without requesting additional approval. Existing product Spend Guard
protections remain authoritative.

Never write or run an uncontrolled loop that can repeatedly issue paid calls.
Before a multi-call paid QA operation, determine approximately how many provider
requests will be made. If more than the QA budget appears necessary, stop and
explain why before proceeding.

Use real paid calls for normal provider workflows and their actual resulting
artifacts. Do not waste paid calls trying to manufacture rare infrastructure
failures such as ambiguous responses, lost workers, or storage failures. Use
existing deterministic fixtures or failure injection for those states.

#### Real content, not placeholder QA

Test content must intentionally exercise the product. Do not use `Hello world`,
Lorem Ipsum, or meaningless repeated text to validate creative workflows.

- Long narration should resemble real narration and use realistic structure.
- Dialogue should contain multiple characters and natural exchanges.
- Tagged testing should use a script that genuinely benefits from supported
  delivery tags.
- Spoken preparation should include conversational punctuation, numbers, and
  difficult phrasing.
- Long-form testing should include multiple realistic paragraphs.
- Use only tags and capabilities actually supported by the selected route.

#### Mandatory operator workflow

When a UI scope is complete in code, the agent must:

1. open the real served application;
2. use the affected workflow manually like an operator;
3. create, edit, play, generate, and reopen the actual objects involved where
   relevant;
4. navigate away and return where state persistence matters;
5. test both common and awkward realistic content;
6. leave useful representative QA state behind;
7. visually critique the result beside several real neighboring objects;
8. exercise relevant state combinations rather than validating only Ready;
9. iterate before declaring the scope complete.

Founder review must never be the first time a new UI is used as a real product.

### Component architecture remains mandatory

Visual quality is not permission to write monolithic JSX.

Keep:

- product facts and state separate from presentation;
- small reusable visual primitives;
- clear ownership;
- feature-local CSS;
- shadcn primitives where appropriate;
- no speculative generic design framework.

A component should be easy to restyle, rearrange, or replace without rewriting
its domain truth.

### Final rule

A UI task is complete only when all three are true:

- **Correct:** data, state, and domain behavior are correct.
- **Usable:** workflows and states are understandable.
- **Designed:** the actual rendered interface has deliberate hierarchy,
  density, spacing, typography, and interaction quality.

If only the first two are true, the UI task is not complete.

## Change discipline

Before substantial changes, inspect the existing implementation and understand
the complete path affected.

Work incrementally. Preserve existing working behavior. Avoid large rewrites
when the work can be completed safely in smaller changes.

When replacing legacy behavior:

1. understand the existing behavior;
2. implement the new path;
3. test it;
4. verify the real application flow;
5. remove the replaced legacy path only after verification.

## Git

Keep changes logically scoped. Do not mix unrelated refactors into the same
change. Preserve a working Git state at successful checkpoints.

## Verification

After relevant code changes, run the existing appropriate tests, type checks,
linting, build, and application smoke checks.

For queued or background capabilities, verification must cover the complete
runtime path: React state and payload, HTTP contract, durable Job, live worker,
application service, provider adapter, persistence, and returned result. Core
behavior must be proven below the UI; browser testing verifies presentation and
interaction, not the correctness of the underlying pipeline. Confirm that the
running API and worker use the same application version before declaring a
change complete.

Report failures accurately. Never claim a migration is complete while active
runtime dependencies on the replaced system remain.

## Product invariants

Application-owned cloned voices are the primary voice product; Alibaba system
voices are secondary catalogue options. A clone's source language, accent, flag
and editorial positioning are descriptive metadata only. A person recorded in
Arabic, English, Indonesian, or any other language remains one language-agnostic
voice identity. These fields must never be treated as the languages that person
is allowed to produce.

A cloned identity may use every ready provider capability bound to its stable
identity. Output-language support is determined only by the selected provider
model's documented output contract. Changing the output language must never
rename the identity, reinterpret its flag, or silently hide, switch, disable, or
reroute an otherwise compatible binding.

Keep provider enrollment constraints separate from product identity. A provider
may reject a particular reference recording for a particular target model; that
is a capability-creation state, not a language restriction on the human voice.
Never project such a failure onto the identity or describe the person as an
"Arabic voice", "English voice", or equivalent.

Do not overload one language field. Store the language actually spoken in each
reference recording as private technical provenance for provider enrollment.
Store editorial fit or preferred use (for example, "Arabic narration") as
separate identity metadata shown to operators. Neither field is an output
permission; the selected model's contract remains the only output-language
authority.

Operator-facing capability names must describe the recording behavior, not a
favoured language. Do not invent language-led names such as "Arabic &
multilingual" for Qwen Omni. Always show the exact provider model separately
from a short neutral capability label. Counts must say what they count (for
example, provider bindings versus recording capabilities) and must not call both
of those things "methods".

Audio Studio is expected to support hundreds of cloned identities. Use stable
identity and binding IDs, shared selectors and repository-backed capability
discovery; never hard-code individual voices or infer identity from display
names.

## Working principle

Make the smallest coherent change that moves the application toward the target
architecture while keeping the product working.
