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
and name are descriptive provenance and best-performance guidance only. They
must never restrict output languages. A cloned voice may use every ready
provider capability bound to its stable identity, and output-language support
is determined at execution time by the selected provider model. Source language
must never silently change, hide, disable, or reroute a cloned capability.

Audio Studio is expected to support hundreds of cloned identities. Use stable
identity and binding IDs, shared selectors and repository-backed capability
discovery; never hard-code individual voices or infer identity from display
names.

## Working principle

Make the smallest coherent change that moves the application toward the target
architecture while keeping the product working.
