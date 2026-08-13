# Audio Studio Production v2 — START HERE

Source-of-truth version: `2026-08-13.production-v2.v1`  
Repository: `mehdiayache/vorvn-audio-studio`  
Baseline commit when this package was frozen: `e8609d8f216e7f09bc1293ea718a52bd0c1b299f`

## What this package is

This is the authoritative product and implementation brief for the **desktop Production v2 redesign** of Audio Studio.

This is not a prompt, moodboard, or optional design reference. It defines the product model the interface must communicate, the spatial desktop workstation, component boundaries, state behavior, technical-information hierarchy, exact implementation scopes, quality gates, and future seams for Waveform Playlist / Naomi Aro, CosyVoice and future SFX/effects.

The underlying Voice / Part / Draft / Job / Take architecture is already mature. This program intentionally makes a **rupture with the current Production UI composition** while preserving domain truth and stable APIs wherever possible.

## Codex setup procedure

1. Read this file completely.
2. Copy this entire directory into the repository as `docs/production-v2/`.
3. Do **not** rewrite files in `LOCKED/` to match implementation decisions.
4. Read every file in `LOCKED/` before planning Scope 0.
5. Read `CODEX_OPERATING_PROTOCOL.md`.
6. Read all scope files once to understand dependencies.
7. Before each scope, reread `LOCKED/00_PRODUCT_NORTH_STAR.md`, `LOCKED/01_DOMAIN_INVARIANTS.md`, that scope file, and `QA/FINAL_ACCEPTANCE.md`.
8. Produce a plan for the current scope before coding.
9. Implement only the authorized scope.
10. Run the required quality gates.
11. Update `PROGRESS.md` in the copied repo folder.
12. Return the report described in `TEMPLATES/SCOPE_REPORT_TEMPLATE.md`.
13. Stop. Do not begin the next scope until explicitly authorized.

## Files Codex may update

Inside the copied repository version of this package, Codex may update only `PROGRESS.md`, `DECISION_AMENDMENTS.md` when the founder explicitly changes a locked product decision, and implementation-specific checklists explicitly marked writable.

Everything under `LOCKED/` remains source-of-truth.

## Desktop-only rule for this program

This program targets serious desktop production work.

Primary reference widths: 1280, 1440, 1600 and 1920.

Do not spend implementation time inventing new mobile layouts, mobile-specific navigation, touch compromises or responsive redesigns during these scopes. Existing mobile behavior must not be intentionally destroyed, but **mobile design is not a quality gate for Production v2**.

## One sentence

> The user stays inside the Production. The software changes around the object and task they are working on; the Production does not disappear behind tools.
