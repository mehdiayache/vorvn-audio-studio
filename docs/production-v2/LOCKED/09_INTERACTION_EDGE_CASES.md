# Interaction edge cases

Generate completion elsewhere never steals focus; update Part and optional discreet notification.

Recast while Composer open: keep Draft text, invalidate/review speaker context, explicit refresh/revalidation before Generate, no silent route substitution.

Route unavailable: keep Draft, explain previous route, require explicit new route, no fallback.

Part revision conflict: keep local changes, show baseline/current revision, safe reload/copy, no silent overwrite.

New Take generation: old selected Take stays playable; new Take appears separately; no auto-selection.

Historical route unavailable: historical Take remains playable/inspectable; only new generation needs current route.

Preview stale: mark stale and offer Refresh.

Focus: Expand Composer focuses script editor; closing Workbench returns to origin when reasonable; Workbench mode changes do not arbitrarily focus first input; Space never hijacks typing.

Keyboard baseline: Space playback when safe, Cmd/Ctrl+K command/search, Cmd/Ctrl+Enter Generate when Composer focused, Enter opens focused Part, Esc dismisses temporary context. Do not create dozens of shortcuts.

Deep links may encode active Part/Workbench view, not unsaved Composer content. Activity should deep-link back to exact Production/Part context when possible.
