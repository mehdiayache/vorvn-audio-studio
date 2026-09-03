# Origins canonical grammar

Read and follow [`docs/create-core.md`](docs/create-core.md) as the canonical
architectural reference for Origins domain boundaries.

```text
Workspace owns.
Explorer places.
Projects group work.
Productions execute creative work.
Library finds.
Creator creates.
Add brings in.
Tools transform.
Files exist.
Objects organize knowledge.
Links associate.
Placements mean actual use.
```

## Human interface contrast

Human-facing copy is never muted. Navigation, labels, instructions, empty-state
guidance and ordinary descriptions use the normal foreground color. Reserve
`muted-foreground` for genuinely secondary technical metadata such as IDs,
timestamps, machine details and disabled states.

## Tokenized design system

`frontend/src/styles/tokens.css` is the canonical source for reusable product UI
tokens: colors, typography, spacing scale, radii, shadows, layers, and shared
motion or layout values. Reuse an existing semantic token and an existing
`frontend/src/components/ui` primitive or shared component before introducing a
new value or implementation.

Add a token when it represents a distinct, reusable semantic role, then consume
that token instead of redefining the role inside individual features. Local
geometry, data-driven values, and media-derived colors may remain local when a
token would obscure their meaning. Such exceptions must be technically
explainable. Improve token use in the surfaces touched by the requested change;
do not start an unrelated big-bang restyling or token migration.

## Quality ratchet

Every touched surface should leave the product and codebase measurably better,
while keeping the requested change localized. Aim for Vercel-level execution:
remove avoidable async waterfalls, protect bundle size, parallelize independent
work, minimize unnecessary rendering and serialization, and keep component APIs
composable instead of accumulating boolean modes. Apply these optimizations when
evidence or the requested work makes them relevant; do not churn healthy code
merely to demonstrate a pattern.

Be highly creative at the product and interaction level, but calm in the
implementation. Polish should feel silent: fast, predictable, accessible,
cohesive, and free of gratuitous decoration, animation, abstraction, or visual
noise. Spend distinctiveness on a small number of choices grounded in the
product's real subject and user task.

## Engineering rules

1. Give each file, component, module, class, and service one understandable
   responsibility. Split independent concerns when they accumulate. Do not use
   an arbitrary line limit as law, but treat ordinary application files that
   reach thousands of lines as requiring review.
2. Reuse before recreating. Check for an existing component, utility,
   integration, or equivalent logic first. Create something new when the need is
   genuinely different; promote it to shared code when repeated use becomes
   real.
3. Do not copy and paste business rules. Each rule must have an identifiable
   logical source rather than several slightly different implementations.
4. Keep interface, business logic, and data access identifiable and separated.
   A page must not simultaneously become the rendering layer, API client,
   business-rules engine, and permission system.
5. Organize code around product capabilities such as projects,
   authentication, users, billing, and settings so that a new developer can
   predict where a feature belongs.
6. Maintain one source of truth where one truly exists, especially for
   permissions, statuses, important constants, business rules, routes,
   configuration, and structural concepts.
7. Make dependencies explicit. A module's requirements, collaborators, and
   outputs should be understandable without relying on hidden behavior.
8. Handle errors deliberately. Never silently swallow an exception, ignore an
   API failure, or leave the user in an impossible state. Handle, propagate, or
   record each error in an actionable way.
9. Use names that explain the code. Prefer specific domain names over vague
   abbreviations. Comments should primarily explain why an unusual choice
   exists, not translate unclear code.
10. Do not abstract to impress. Prefer a few simple, readable functions over a
    generic framework that adds more complexity than it removes.
11. Design for plausible product evolution, not imaginary scale. Every extra
    layer must solve a real or highly probable problem.
12. Keep changes localized. A small product change should normally stay within
    a predictable area instead of modifying many unrelated files.
13. Cover critical behavior with automated tests. Prioritize authentication,
    permissions, payments, important calculations, data transformations, and
    critical workflows over indiscriminate pixel or getter tests.
14. Remove dead code. Do not retain obsolete commented blocks, unused helpers,
    or ambiguous legacy variants; Git preserves history.
15. Treat these rules as engineering constraints, not religion. An exception is
    acceptable when it is clearer and can be justified technically, never only
    because it currently works.

## Scope and verification

The approved Shell + Home visual pass is closed. Do not reopen its visual
optimization unless the user explicitly requests it or a requested functional
change necessarily touches it.

Before completing a change, run checks proportional to its risk. Critical flows
must have automated coverage, and user-facing interaction changes must receive
focused browser verification when the application can be run locally.
