# Design QA — Scope 1 Canonical Speech Part

## Acceptance target

- Selected direction: founder-approved option 2.
- Reference: `/Users/berberos/.codex/generated_images/019ff8c8-3403-7413-94e1-31a32c58ed73/exec-1339c1bf-ab0f-4981-b7ec-4e02d5948863.png` (1487 × 1058).
- Implemented capture: `/tmp/audio-studio-option2-implementation-final.png`.
- Side-by-side review: `/tmp/audio-studio-option2-comparison-final.png`.
- Real workspace: `test production of conversation` (`05e19cd3-c2f6-4fa0-90c6-0159d11e3556`).

## Pass 1 — structural comparison

The first rendered comparison found two material fidelity defects:

1. the generic `.sequence-card` rule overrode the Speech Part grid, collapsing the intended order / identity / content columns;
2. the Production canvas remained capped at 1040 px, making the ledger visibly narrower and denser than the approved 1200 px direction.

The card rule now has explicit Speech-Part specificity and the Production canvas is capped at 1200 px. The sequence workspace owns the full available width, and the footer exposes visible-part duration and spend totals like the reference.

## Pass 2 — visual result

At 1440 × 1024 the implementation and reference now share the same dominant composition:

- 1200 px centered Production ledger;
- stable 48 px order, 190 px identity, and flexible script/result columns;
- one continuous bordered sequence rather than floating black cards;
- compact script rows with persistent Voice/method and Take/caption/spend facts;
- edit and reorder affordances visible without opening overflow;
- contextual generation action kept subordinate to the everyday playback/result lane;
- semantic state color: identity accent, blue active/generating, violet playing, green ready/captions, amber review, and red failure.

The implementation deliberately uses real Audio Studio data, existing Lucide icons, shared `VoiceIdentity`, `AudioWaveform`, and local shadcn primitives. No fake UI assets or catalog HTML/CSS were copied.

## Real operator QA

The Living QA Production was used as a persistent corpus. Manual checks covered:

- opening a Part in the Workbench through the visible edit affordance;
- reordering affordances (`Move earlier`, `Move later`, `Move to position`);
- playing a real selected Take and observing both the inline waveform and global player;
- bulk-selecting a Part and verifying the independent selected treatment;
- generating alternatives through the real provider route and observing the active blue operation state;
- reviewing multiple Takes and explicitly reselecting an older Take;
- navigating away, returning, and confirming persisted selection/state;
- maintaining surrounding Parts with Original and Tagged immutable Take states.

That exploratory pass found a real pipeline defect: the application service filtered out explicit `select_result=false` before persistence, so a Generate Alternative could silently promote its result despite the correct UI payload. The service now preserves the command and a Python regression test covers the complete service/repository boundary. The Living QA Production keeps a newer unselected Take as useful future test state.

Rare provider failures were not manufactured with paid calls. Deterministic component fixtures remain the correct coverage for failure, lost, ambiguous, retrying, and confirmation states.

## Geometry and responsive checks

Measured document width equaled viewport width with no horizontal page overflow at 1280, 1440, 1600, and 1920 px. The ledger stayed 1200 px and centered at each desktop width.

At 767 px the ledger contracted to 704 px and retained the three-column grammar. At 640 px the responsive card switched to its compact two-column mobile composition without document overflow. Mobile was verified for safety only; it was not redesigned by Scope 1.

## Intentional differences / later scope

- The approved reference illustrates generating, caption-review, and generation-failure rows simultaneously. The persistent Production reflects its current real data: a ready unselected alternative and several Tagged Takes. The same state grammar was verified interactively for generation and deterministically for rare failures.
- Music Bed sound/overflow controls and the toolbar split-button affordance remain owned by later Production scopes. Scope 1 did not expand into those controls.
- The header's historical aggregate provider spend and the ledger footer's visible-Part spend answer different questions; the footer is intentionally calculated from the Parts currently in this sequence.

## Outcome

Scope 1 matches the founder-selected ledger direction closely while preserving immutable Take truth, durable Job truth, current Audio Studio architecture, and the verified Scope 0 shell.
