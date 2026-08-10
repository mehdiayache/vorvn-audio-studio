# Composer capability selector — design QA

- Source visual truth: `/Users/berberos/.codex/generated_images/019fcbdc-bc46-7f03-a02e-db45e8c852cc/exec-a2bbc3a8-84f5-4442-8aa3-07b60f27a625.png`
- Implementation screenshot: `/Users/berberos/VORVN-DEV/vorvn-os/projects/text-to-voice/.codex-audits/06-compact-selector-rows.png`
- Combined comparison: `/Users/berberos/VORVN-DEV/vorvn-os/projects/text-to-voice/.codex-audits/04-reference-vs-implementation.png`
- Desktop viewport: 1280 × 720 CSS px, browser DPR 2; browser screenshots normalized to CSS-pixel dimensions by the capture surface.
- Source pixels: 1640 × 1024. Implementation focused screenshot: 1280 × 720.
- State: Eve Serenity selected, output language unset, Expressive speech + tags selected, Details collapsed.

## Full-view comparison evidence

The implementation preserves the selected direction's single grouped surface, three compact rows, restrained blue selected state, human purpose first, exact model at the right, readiness, documented language count, and collapsed Details disclosure. It correctly uses the application's existing shell, spacing tokens, typography, borders, and responsive Composer rather than reproducing the mock as an isolated panel.

The mock's inaccurate placeholder model names and `17 languages` values were intentionally replaced with live catalogue truth: Qwen Audio Flash / 13, Qwen3 Voice Clone / 10, and Qwen 3.5 Omni Flash + Plus / 29.

## Focused region evidence

`06-compact-selector-rows.png` confirms that all three rows fit the live 900px Composer stage, model labels remain visible, the selected state is clear, and readiness and language counts align consistently. The Details control remains immediately below the group.

## Required fidelity surfaces

- Fonts and typography: existing Audio Studio type tokens retained; hierarchy and weights match the source direction. Long purpose text truncates intentionally at the compact row boundary.
- Spacing and layout rhythm: one 12px-radius grouped surface, 12px row padding, consistent dividers, and no nested model cards.
- Colors and visual tokens: existing surface, border, primary-soft, primary, success, foreground, and muted-foreground tokens only; no invented gradient or palette.
- Image quality and assets: no raster assets are needed in this selector. Radio, status, lock, and disclosure icons come from the existing Lucide dependency.
- Copy and content: capability names and purposes come from the provider catalogue; model names, IDs, readiness, and language counts are live data rather than hard-coded display facts.

## Interaction and responsive verification

- Exact long reading selection: passed.
- Natural performance selection: passed.
- Conditional Plus/Flash quality control: visible after selecting Natural performance.
- Details disclosure and exact Omni model IDs: passed.
- Batch shared compact mode: three rows rendered, no console warnings or errors.
- Mobile 390 × 844: document width remained 390px; all three rows measured 330px with no internal overflow.
- Speak console: no warnings or errors.

## Comparison history

Initial comparison found no actionable P0, P1, or P2 mismatch. No post-comparison visual fix loop was required.

## Follow-up polish

- P3: At narrower desktop widths, the one-line purpose text uses ellipsis. This is the intended compact behavior; the full purpose remains in the button's accessible name and the Details disclosure carries the technical explanation.

final result: passed
