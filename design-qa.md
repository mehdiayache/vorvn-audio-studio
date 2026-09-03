# Origins shell and Workspace Home design QA

## Comparison setup

- Source visual truth: `/var/folders/cb/4m2zrd4916q19q1n5mrpc_jh0000gn/T/TemporaryItems/NSIRD_screencaptureui_IcCKH8/Screenshot 2026-09-03 at 14.28.37.png`
- Rendered implementation: `/tmp/origins-shell-home-final.png`
- Combined comparison: `/tmp/origins-shell-home-comparison.png`
- Source viewport: 1308 × 876
- App browser viewport: 2073 × 1150
- State: populated Campaign Studio Home, desktop navigation, Workspace menu closed
- Normalization: the source is a schematic wireframe rather than a pixel-styled screen. The comparison preserves each image's aspect ratio and evaluates information architecture, grouping, hierarchy, and spatial composition rather than copying placeholder styling.

## Visual review

### Full view

- Top-level composition matches: one continuous light application background, one horizontal Origins/Workspace bar, one fixed left navigation rail, and one rounded white content body.
- The rail and horizontal chrome are transparent; neither creates a competing white panel.
- The rounded body contains the centered welcome statement and the split Home content.
- The left side contains Creator shortcuts followed by Production types; the right side contains My Projects followed by My Productions.
- The implementation uses real Workspace data, product tokens, and Lucide icons instead of the wireframe's placeholder circles and rectangles.

### Focused regions

- Shell: fixed-width transparent rail, readable labels, active Home state, and no expand/collapse affordance or hidden content.
- Welcome: centered Workspace-specific welcome copy and one dominant creation question.
- Content body: one white rounded surface with stable two-column division, coherent internal padding, circular Creator actions, and compact visual cards for existing work.

## Iteration history

1. Pre-pass implementation used a collapsible rail and separated Home sections. This created a P1 mismatch with the fixed, unified wireframe composition.
2. Removed the collapse state, context, toggle, icons, data attributes, and expansion CSS.
3. Moved Origins and Workspace selection into a fixed top bar and rebuilt Home as one split board.
4. Replaced the white rail and white top bar with one continuous shell background, then promoted the rounded white surface to the actual content body.
5. Removed muted styling from navigation and ordinary Home copy while preserving it for technical metadata.
6. Re-captured the live app with human-readable sample names and compared the complete rendered state beside the source.

## Findings after correction

- P0: none.
- P1: none.
- P2: none.
- Typography: product typography is intentionally retained; size and hierarchy follow the wireframe.
- Spacing and layout: the primary regions and order match; the body has a clear rounded boundary after the two chrome rails, and responsive behavior collapses the board to one column below desktop width.
- Color and tokens: restrained Origins tokens replace the wireframe grayscale without changing its structure.
- Contrast: normal operator copy uses foreground contrast; subdued color remains limited to timestamps, status metadata, and unavailable future capabilities.
- Asset quality: no fake raster placeholders or missing assets; the interface uses the established icon library and real data fallbacks.
- Copy: labels are product-real while preserving the source hierarchy.

final result: passed
