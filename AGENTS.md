# Audio Studio repository instructions

## Product and architecture

Audio Studio is professional desktop creative software, not a dashboard.

Keep React presentation, application logic, persistence, providers, and API
contracts separate. Every important responsibility has one owner. Prefer the
current architecture and working domain services; never add new dependencies
on legacy `server.py`, legacy `db.py`, or the removed UI.

Preserve business truth, stable IDs, provider evidence, immutable Takes,
historical spend, and explicit operator choices. Do not let existing JSX or CSS
dictate the experience.

## Production UI direction

Design from the operator's job before editing components:

`goal -> needed information -> decision -> action -> feedback -> next state`

Production must feel calm, obvious, premium, and fast. Use one strong spatial
hierarchy, fewer containers, comfortable density, readable typography, stable
action placement, and progressive disclosure.

For Production work:

- desktop only unless mobile is explicitly authorized;
- optimize at 1440 px, then verify 1280, 1600, and 1920 px;
- 100+ Parts is a scalability requirement, not a request for giant test text;
- keep consecutive Part cards visible, airy, and easy to scan;
- keep the common Ready state quiet and let exceptions add only the information
  they need;
- editing/Composer must be a clearly separate surface, never a cramped sidebar
  or content wedged inside a dense card;
- captions and technical detail must be readable on demand, not permanently
  packed into every row;
- remove controls, labels, borders, badges, panels, and repeated facts before
  adding new UI;
- do not create a generic ShadCN dashboard, card soup, or an "admin" layout.

Use semantic VORVN tokens only. Neutral structure carries hierarchy; near-black
is the normal action accent; green means success; amber means warning/review;
red means failure/destructive; blue means neutral information. Cast/media
identity colors are categorical and never status colors. Never use color as the
only signal or tint a whole Part because one nested fact has a state.

## UI sources and primitives

Use UI VORVN as mature precedent, not code to paste:

- Registry: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/src/registry/ui-vorvn.registry.json`
- Catalog: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/components/index.html`
- Tokens: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/src/foundation/tokens.css`
- Foundation: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/docs/FOUNDATION_V1.md`
- Typography: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/docs/TYPOGRAPHY_V1.md`
- Media: `/Users/berberos/VORVN-DEV/vorvn-os/projects/ui-vorvn/docs/MEDIA_VIDEO_AND_VOICE.md`

Registry `reference` entries are established precedent. `candidate` requires
validation. `fixture` is demonstration only. Never use rejected labs.

Use Audio Studio's local ShadCN/Radix primitives. Query the ShadCN MCP before
recreating a generic primitive and run its audit checklist after UI changes.
Translate precedent into the existing React architecture and tokens; do not
create a parallel design system.

## Simplicity

Prefer clarity over abstraction. Do not add speculative frameworks, providers,
state layers, component factories, wrapper trees, or giant prop APIs. Create a
shared component only for real repetition or a meaningful product primitive.
Code should be easy to understand, change, and delete.

## Working and verification discipline

Inspect the complete affected path before substantial changes. Implement in
coherent checkpoints, preserve working behavior, and remove replaced UI only
after the new path works.

For user-facing work, use the real served desktop application like an operator
after a coherent implementation exists. Prefer the persistent Production named
`Test Production of Conversation`. Keep realistic representative state, but use
short-to-medium purposeful samples and only the minimum long-form case needed.
Do not create hundreds of verbose scripts to prove scalability. Founder review
must not be the first real product use.

Visual QA should be focused: primary workflow, several neighboring objects,
important exceptional states, and the desktop width matrix. Do not spend hours
looping over screenshots or substitute screenshots for good code and real
interaction.

Automated verification must match the change: tests, type checks, build, and
runtime path where relevant. Browser checks prove presentation and interaction;
domain and service tests prove behavior. Report failures honestly.

Real paid provider QA is allowed only when it materially proves the normal
workflow, within both USD $5 and 10 calls per deliberate pass. Never use paid
loops or waste calls manufacturing rare failures.

Commit and push each tested logical checkpoint to the active `codex/` branch.
Do not mix unrelated refactors.

## Voice product invariants

An application-owned cloned voice is one language-agnostic identity. Recording
language, accent, flag, and editorial fit are metadata, never output-language
permissions. Output support comes only from the selected provider model.

Keep identity, provider enrollment, and output capability separate. Never
silently hide, switch, disable, or reroute a compatible binding when language
changes. Show the exact provider model separately from a neutral capability
label. Use stable identity/binding IDs and repository-backed discovery; never
hard-code individual voices or infer identity from display names.
