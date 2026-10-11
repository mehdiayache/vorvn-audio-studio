import {useStudioTimelineHistory, type StudioTimelineDualHistoryOptions} from '../../../../components/studio-timeline/use-studio-timeline-history'
export type {TimelineHistoryDomain, TimelineAudioRevisionKind} from '../../../../components/studio-timeline/use-studio-timeline-history'

/** Compatibility adapter for the original Studio's separate audio and visual services. */
export function useTimelineHistory(options: StudioTimelineDualHistoryOptions) {
  return useStudioTimelineHistory(options)
}
