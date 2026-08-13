# Scope 7 and founder redesign convergence report

## Status

`COMPLETE ON codex/production-v2-scopes-2-7 — READY FOR FOUNDER REVIEW.`

The frozen Production v2 package remains authoritative for domain behavior.
The founder's later UI direction is recorded in
`docs/production-v2/DECISION_AMENDMENTS.md`: desktop editing now uses a
dedicated full-workstation Stage instead of the rejected Workbench sidebar.

## Product result

- The Production sequence is the persistent home surface. It remains mounted,
  preserves position, and becomes inert while focused work is open.
- Composer, Part inspection, captions, Cast, Music, Health, and Mix & Export
  open as explicit Stage surfaces with one Back to Production action. No
  everyday desktop Composer modal or Part Sheet is used.
- Speech Parts are airy repeated product objects rather than generic cards.
  Move, exact position, Edit, Cast/Voice, exact method, script, selected Take,
  immutable input state, captions, operation truth, duration, and spend remain
  visible. Generate Alternative stays secondary.
- Semantic color is grammatical: blue for active/selected, green for
  ready/current, amber for Draft/review/stale, red for failure/destructive, and
  identity colors only for Cast/Voice identity.
- Captions use a two-pane editorial workspace with saved languages on the left
  and readable Text/SRT/VTT/JSON content on the right. Durable caption state and
  stale truth remain explicit.
- The global Production player is one 832 × 60 px transport at the tested 1280
  desktop width. It keeps playback position, time, speed, CC, download, and
  close visible while removing the low-priority volume controls from this
  compact presentation.
- Health is a grouped release queue with blocking and review severity rather
  than an undifferentiated issue list. Mix & Export explains the exact current
  mix, blocked Parts, preview truth, finishing contract, and immutable history.
- Search/Jump works against 100+ Parts. Choosing a result restores the complete
  sequence and scrolls the real Part into view instead of leaving a misleading
  one-row filtered Canvas.
- Sequence cards use deferred rendering hints without adding a second virtual
  list or eager waveform decode path.

## Real product QA

Focused exploratory QA used the persistent Living QA Production
`test production of conversation`
(`05e19cd3-c2f6-4fa0-90c6-0159d11e3556`) with its existing 101 Parts. No new
Parts, paid provider calls, or destructive cleanup were performed.

Proven in the served desktop application:

- Part 100 can be found from Search/Jump; the full 101-Part sequence returns
  and Part 100 lands inside the viewport.
- Sequence Fit timing renders all 101 ordered clips with no document overflow.
- Part 1 opens in the dedicated Stage; Text, Takes, Captions, and Details remain
  available while the Canvas is inert.
- Captions render a 304 px language list beside an 812 px viewer at 1280 and
  scroll inside the Part surface rather than escaping it.
- Two selected Parts expose the complete bulk action bar; selection was cleared
  without a data mutation.
- Cast, Music, Health, and Mix & Export all open in the same Stage geography and
  remain horizontally contained.
- The Production player is one row, its seek control is visible, volume is
  intentionally absent, and no horizontal overflow occurs.
- Escape closes the Stage. Browser diagnostic logs were empty.

The current Stage and player were exercised at 1280, the smallest required
desktop width. The underlying Canvas had already passed 1280, 1440, 1600, and
1920 browser geometry before this convergence; the new Stage uses bounded
`min()` frames and passed the smallest width without overflow. Mobile was not
redesigned or tested.

## Verification

- OpenAPI generation, TypeScript, and Vite production build passed.
- React: 74 files, 239 tests passed.
- Python: 324 tests passed against the local PostgreSQL test database.
- Provider/domain contracts: 31/31 passed.
- Render and paid-destination contracts: 15/15 passed.
- Voice package and exact voice routing contracts passed.
- shadcn audit completed after implementation.
- `git diff --check` passed.

## Git checkpoints

- `7b3dacb` — rebuild Production around a focused Canvas.
- `6985727` — replace the sidebar/modal editing model with the dedicated Stage;
  finish 100+ navigation, Health grouping, Composer geometry, and player layout.
- `f4511c5` — finish semantic ready feedback, Escape behavior, and record the
  founder's authoritative spatial amendment.

## Boundary

This report closes Scope 7 and the founder-requested Production redesign on the
feature branch. It does not merge the branch, redesign mobile, or start another
scope.
