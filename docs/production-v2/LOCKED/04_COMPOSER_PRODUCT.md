# Composer product contract

One Composer core, multiple spatial hosts: Production Inline Composer, Production Workbench Composer, Speak Mega Composer. Do not fork business logic.

Inline Composer appears exactly at insertion seam or under an existing Part for New Take. Compact mode supports destination, Voice/Cast context, exact route, language, text, estimate, Save Draft, Generate, Expand. Header says `New speech · before Part 8` or `New Take · Part 12`.

Expand moves the same Draft/state into Workbench. Inline location remains represented as an anchor such as `Editing speech before Part 8 → Workbench`. No duplicate state.

New Take belongs visually to its Part. Old selected Take remains playable while new Take generates. Composer need not stay open after enqueue.

Production Composer is not a mandatory Who/Words/Performance/Output wizard. Use persistent compact Recording Context, dominant Script Workspace, Performance disclosure, Output disclosure, always-visible Action Bar.

Recording Context shows Cast Role when applicable, Voice Identity, exact recording method, capability and language. Changing Voice clears incompatible route. Language never changes route.

Script Workspace contains text-version switcher, editor viewport, preparation actions, review, compare, copy. Editor consumes remaining vertical space. Generate remains pinned regardless of script length.

Human text labels: Original, Spoken, Tagged. Historical Take marks exact version used. Never stack three long scripts vertically.

Tagged remains plain canonical text data with syntax-aware presentation, selectable and copyable exactly. No rich-text domain required.

Compare is simple diff/side-by-side using existing primitives, not a collaborative-document engine.

Performance only shows capability-supported controls. Arbitrary valid `modeId` remains representable. Output remains compact.

Action Bar always shows Draft save state, character count, estimated provider cost, destination/action, Save Draft when applicable, and correct Generate variant.

Speak uses the same core in a larger laboratory layout and remains standalone.
