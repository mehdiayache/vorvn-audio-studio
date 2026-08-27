import type { ComponentProps, RefObject } from "react"
import { CircleAlert, SlidersHorizontal, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MixExportWorkspace } from "@/features/production/mix-export-workspace"
import { productionHealth, type ProductionHealthIssue } from "@/features/production/production-health-sheet"
import { audibleAudioClips } from "@/features/sound-scene/sound-scene-audibility"
import { formatAuthoredRole, formatPartNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Production, SoundScene, VisualScene } from "@/types/domain"
import { WorkstationPaneHeader } from "../workstation-pane-header"
import { CollapsedPaneSummary } from "../workstation-stage-support"
import type { WorkstationPartState } from "../workstation-sequence"

function MixOutline({ production, soundScene, onCollapse }: { production: Production; soundScene: SoundScene; onCollapse: () => void }) {
  const issues = productionHealth(production.parts)
  const staleOverrides = soundScene.resolved.orphans.filter((orphan) => orphan.kind === "sequence_override").length
  const drafts = production.parts.filter((part) => part.kind === "draft" || part.kind === "speech" && !part.clip_id).length
  const linkedSounds = production.parts.filter((part) => part.kind === "asset" && part.enabled !== false).length
  const audioClips = audibleAudioClips(soundScene).length
  const audioLabel = `${audioClips} Audio clip${audioClips === 1 ? "" : "s"}`
  const soundSummary = audioClips
    ? linkedSounds ? `${audioLabel} + ${linkedSounds} linked sound${linkedSounds === 1 ? "" : "s"}` : audioLabel
    : linkedSounds ? `${linkedSounds} linked sound${linkedSounds === 1 ? "" : "s"}` : "Voice only"
  return <div className="ws-mix-outline">
    <WorkstationPaneHeader title="Release" meta="Output checklist" onCollapse={onCollapse} />
    <div className="ws-mix-step is-current"><span>1</span><div><b>Script</b><small>{drafts ? `${drafts} planned for later` : "All speech recorded"}</small></div></div>
    <div className="ws-mix-step"><span>2</span><div><b>Sound</b><small>{soundSummary}</small></div></div>
    <div className="ws-mix-step"><span>3</span><div><b>Quality</b><small>{issues.length + staleOverrides ? `${issues.length + staleOverrides} items to review` : "Ready to finish"}</small></div></div>
    <div className="ws-mix-step"><span>4</span><div><b>Exports</b><small>{production.exports.length} saved versions</small></div></div>
  </div>
}

export function ReleaseInspector({ issues, staleOverrides, onLocate, onRemoveOverride }: {
  issues: ProductionHealthIssue[]
  staleOverrides: string[]
  onLocate: (id: number) => void
  onRemoveOverride: (partPublicId: string) => void
}) {
  const blocking = issues.filter((issue) => issue.severity === "blocking").length
  const review = issues.length - blocking + staleOverrides.length
  return <div className="ws-release-inspector">
    <section className={blocking ? "has-blockers" : review ? "has-review" : "is-clear"}><CircleAlert /><div><span className="ws-kicker">Release status</span><h3>{blocking ? `${blocking} blocking issue${blocking === 1 ? "" : "s"}` : review ? `${review} item${review === 1 ? "" : "s"} to review` : "Ready to export"}</h3><p>{blocking ? "Restore missing or broken media before making the final file." : review ? "These states do not silently block export, but remain explicit." : "No blocking audio issues remain."}</p></div></section>
    <div className="ws-release-issue-list">{issues.map((issue) => <button key={`${issue.part.id}:${issue.title}`} onClick={() => onLocate(issue.part.id)}><span>{formatPartNumber(issue.part.position ?? 0)}</span><div><b>{issue.title}</b><small>{formatAuthoredRole(issue.part.authored_role) || issue.detail}</small></div><i className={issue.severity} /></button>)}
      {staleOverrides.map((partPublicId) => <div className="ws-release-stale-override" key={partPublicId}><span><SlidersHorizontal /></span><div><b>Obsolete Script mix override</b><small>Its original Part no longer exists. It is not applied to another Part.</small></div><Button variant="ghost" size="sm" onClick={() => onRemoveOverride(partPublicId)}><Trash2 /> Remove</Button></div>)}
    </div>
  </div>
}

type ExportWorkspaceProps = ComponentProps<typeof MixExportWorkspace>

export function ExportStage({ centerPaneRef, production, soundScene, visualScene, outlineOpen, collapsedNumber, collapsedState, collapsedPlaying, onOutlineOpenChange, ...workspaceProps }: ExportWorkspaceProps & {
  centerPaneRef: RefObject<HTMLElement | null>
  outlineOpen: boolean
  collapsedNumber: string
  collapsedState: WorkstationPartState
  collapsedPlaying: boolean
  onOutlineOpenChange: (open: boolean) => void
  visualScene: VisualScene
}) {
  return <>
    <aside className={cn("ws-left-pane", !outlineOpen && "is-collapsed")} aria-label="Export navigation">
      {outlineOpen
        ? <MixOutline production={production} soundScene={soundScene} onCollapse={() => onOutlineOpenChange(false)} />
        : <CollapsedPaneSummary label="release checklist" number={collapsedNumber} state={collapsedState} playing={collapsedPlaying} onExpand={() => onOutlineOpenChange(true)} />}
    </aside>
    <main className="ws-center-pane" ref={centerPaneRef}>
      <div className="ws-mix-canvas"><MixExportWorkspace production={production} soundScene={soundScene} visualScene={visualScene} {...workspaceProps} /></div>
    </main>
  </>
}
