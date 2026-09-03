# Project working rules

Keep this repository lean and work from the user's current request, the current
code, and verified product behavior. Do not treat historical implementation or
development fixtures as the target architecture.

- Prefer simple, direct, end-to-end changes. Do not add speculative frameworks,
  compatibility layers, migration bridges, or duplicate abstractions.
- Pre-production architecture may change cleanly. User-created Files, uploads,
  generated media, Objects, Projects, Productions, and other shared QA resources
  must not be deleted or reset without explicit authorization.
- Reuse existing QA resources when they fit the scenario. Create new fixtures
  only when the test requires different characteristics.
- Keep provider integrations behind the repository's existing provider
  interfaces. Surface failures clearly; never silently substitute behavior.
- Keep dependencies minimal, remove replaced dead code, and verify changes in
  proportion to their risk.
- For every Origins product, UI, or UX task, read and follow the installed
  `origins-product-design` skill before acting. The skill is the maintained
  product-design reference; do not reproduce a second product constitution here.
