import { useEffect, useState } from "react"

import { PartCaptionPanel } from "@/components/part-caption-panel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePartDetailData } from "@/hooks/use-part-detail-data"
import type { PlayerSource, ProductionPart, VoiceDirectory } from "@/types/domain"
import type { PartDetailTab } from "@/components/sequence-actions"
import { PartInspectorDetails } from "./part-inspector-details"
import { PartInspectorScript } from "./part-inspector-script"
import { PartInspectorTakes } from "./part-inspector-takes"

import "@/features/production/production-inspector.css"

export type PartInspectorTab = PartDetailTab

export function partInspectorTabs(part: ProductionPart | null): PartInspectorTab[] {
  return part && ["audio", "speech"].includes(part.kind)
    ? ["script", "takes", "captions", "details"]
    : ["script", "details"]
}

export type PartInspectorProps = {
  productionId: number
  part: ProductionPart | null
  directory: VoiceDirectory
  playingKey?: string
  playerPlaying: boolean
  onClose: () => void
  onDuplicate: (part: ProductionPart) => void
  onDelete: (part: ProductionPart) => void
  onNewTake: (part: ProductionPart) => void
  onPlay: (source: PlayerSource) => void
  onChanged: () => Promise<void>
  initialTab?: PartInspectorTab
  onTabChange?: (tab: PartInspectorTab) => void
}

export function partInspectorTitle(part: ProductionPart | null) {
  if (!part) return "Part"
  const kind = part.kind === "silence" ? "Silence" : part.kind === "asset" ? "Venture audio" : part.kind === "draft" ? "Draft speech" : "Speech"
  return `Part ${String((part.position ?? 0) + 1).padStart(2, "0")} · ${kind}`
}

function firstTabLabel(part: ProductionPart) {
  return part.kind === "silence" ? "Timing" : part.kind === "asset" ? "Asset" : "Text"
}

export function PartInspectorContent({ productionId, part, directory, playingKey, playerPlaying, onDuplicate, onDelete, onNewTake, onPlay, onChanged, initialTab = "script", onTabChange }: PartInspectorProps) {
  const [tab, setTab] = useState<PartInspectorTab>(initialTab)
  const data = usePartDetailData(productionId, part, onChanged)
  const recorded = Boolean(part && ["audio", "speech"].includes(part.kind))
  useEffect(() => {
    const available = new Set(partInspectorTabs(part))
    setTab(available.has(initialTab) ? initialTab : "script")
  // Part identity and type jointly own the valid tab set.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part?.id, part?.kind, initialTab])
  if (!part) return null
  const changeTab = (value: string) => { const next = value as PartInspectorTab; setTab(next); onTabChange?.(next) }
  return <div className="part-inspector-content" data-part-kind={part.kind}>
        <Tabs value={tab} onValueChange={changeTab} className="part-inspector-tabs">
          <TabsList variant="line"><TabsTrigger value="script">{firstTabLabel(part)}</TabsTrigger>{recorded && <TabsTrigger value="takes">Takes <span>{data.takes.length + 1}</span></TabsTrigger>}{recorded && <TabsTrigger value="captions">Captions <span>{data.captions.length}</span></TabsTrigger>}<TabsTrigger value="details">Details</TabsTrigger></TabsList>
          <ScrollArea className="part-inspector-scroll">
            <TabsContent value="script"><PartInspectorScript part={part} directory={directory} currentPlaying={playerPlaying && playingKey === `part:${part.id}`} onPlay={onPlay} onNewTake={onNewTake} onDuplicate={onDuplicate} onDelete={onDelete} /></TabsContent>
            {recorded && <TabsContent value="takes"><PartInspectorTakes part={part} takes={data.takes} loading={data.loading} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onNewTake={onNewTake} onPromote={(take) => void data.promote(take)} /></TabsContent>}
            {recorded && <TabsContent value="captions"><PartCaptionPanel captions={data.captions} transcript={data.transcript} languages={directory.config?.languages || []} sourceLanguage={part.language} loading={data.loading} busy={data.captionBusy} confirmation={data.captionConfirmation} job={data.captionJob} onSelect={data.selectTranscript} onCreate={data.makeCaptions} onTranslate={data.translate} onConfirm={data.confirmCaptionAction} onCancel={data.cancelCaptionAction} onRetryJob={data.retryCaptionJob} onDismissJob={data.dismissCaptionJob} /></TabsContent>}
            <TabsContent value="details"><PartInspectorDetails part={part} directory={directory} /></TabsContent>
          </ScrollArea>
        </Tabs>
        {data.message && <div className="part-inspector-message" role="status" aria-live="polite">{data.message}</div>}
        <Dialog open={Boolean(data.takeConfirmation)} onOpenChange={(open) => { if (!open) data.cancelTakeConfirmation() }}><DialogContent><DialogHeader><DialogTitle>Use this outdated Take?</DialogTitle><DialogDescription>This audio was made before the Part’s script or Cast changed. It remains historical and visibly outdated if you select it.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={data.cancelTakeConfirmation}>Cancel</Button><Button onClick={() => void data.confirmTake()}>Use outdated Take</Button></DialogFooter></DialogContent></Dialog>
  </div>
}

export function MobilePartInspectorSheet(props: PartInspectorProps) {
  const { part, onClose } = props
  return <Sheet open={Boolean(part)} onOpenChange={(open) => { if (!open) onClose() }}>
    <SheetContent className="part-inspector">
      {part && <>
        <SheetHeader><SheetTitle>{partInspectorTitle(part)}</SheetTitle><SheetDescription>Part {(part.position ?? 0) + 1} · revision {part.revision || 1}</SheetDescription></SheetHeader>
        <PartInspectorContent {...props} />
      </>}
    </SheetContent>
  </Sheet>
}
