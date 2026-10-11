import {acceptsStudioTimelineShortcut, useStudioTimelineShortcuts, type StudioTimelineShortcutOptions} from '../../../../components/studio-timeline/use-studio-timeline-shortcuts'

export const acceptsTimelineShortcut = acceptsStudioTimelineShortcut

/** Original Studio and Project consume the same callback-only keyboard policy. */
export function useTimelineShortcuts(options: StudioTimelineShortcutOptions) {
  useStudioTimelineShortcuts({...options, scope: options.scope ?? '.timeline-workspace', hasSelection: options.hasSelection ?? true})
}
