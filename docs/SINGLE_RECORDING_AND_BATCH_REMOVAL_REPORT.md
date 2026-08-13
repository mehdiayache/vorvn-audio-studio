# Single recording and Batch removal

Date: 2026-08-14  
Branch: `codex/production-v2-scopes-2-7`

## Product outcome

- Every Speech Part has one active recording.
- Recording again replaces that recording; there are no alternatives,
  ordinals, selection controls or promotion workflow.
- The internal recording snapshot remains immutable while active and is
  replaced atomically under a unique one-recording-per-Part database index.
- Stale concurrent results never replace the current recording.
- Durable Jobs, ProviderAttempts, budget records and audit evidence preserve
  provider history and spend after a recording is replaced.
- Batch is absent from navigation, routes, OpenAPI, worker dispatch,
  application/domain services, persistence adapters and dependencies.
- Existing historical Batch Job evidence is retained under the neutral label
  `Legacy bulk operation`.

## Living QA Production cleanup

`test production of conversation` retained Parts 1–14. Exact positions 15–101
were archived through the supported Production deletion API: 87 Parts removed.
The persistent Production itself and its first 14 representative Parts were not
deleted.

## Verification contract

Acceptance must cover OpenAPI generation, TypeScript, production build, React
tests, the complete Python suite, domain/provider/render contracts, exact
removed-route checks, the one-recording database constraint, the retained
14-Part QA corpus, and an exploratory desktop pass in the served application.

## Completed verification

- `CI=true pnpm check` passed: OpenAPI generation, TypeScript, production
  build, and 236/236 React tests.
- `.venv/bin/python -m unittest discover` passed: 302/302 Python tests.
- Provider/domain contracts passed 31/31.
- Render/provider destination contracts passed 15/15.
- Fresh-database migration bootstrap and idempotency passed with migration 027.
- Live PostgreSQL reports `takes_one_recording_per_part_idx` present and a
  maximum of one internal recording row per Part.
- Live API reports 14 active Parts at contiguous positions 0–13 and no removed
  `takes` projection field.
- Removed Batch API returned 404 and the live OpenAPI schema contains no Batch
  path.
- Real desktop QA opened the Production, inspected neighboring recorded and
  Draft Parts, opened the recording action menu, entered and left the Part
  Stage, entered and left the replacement Composer, navigated to Work and
  returned. The only recording replacement action is `Replace recording`;
  recorded Part tabs are Text, Captions and Details; Work navigation contains
  Work, Speak, Voices, Subtitles, Activity and Settings with no Batch entry.
- Browser console: no warnings or errors. No paid provider request was made.
