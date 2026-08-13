import { useEffect, useState } from "react"

import { PartCaptionPanel } from "@/components/part-caption-panel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePartDetailData } from "@/hooks/use-part-detail-data"
import type { PlayerSource, ProductionPart, VoiceDirectory } from "@/types/domain"
import { PartInspectorDetails } from "./part-inspector-details"
import { PartInspectorScript } from "./part-inspector-script"
import { PartInspectorTakes } from "./part-inspector-takes"

import "@/features/production/production-inspector.css"

export type PartInspectorTab = "script" | "takes" | "captions" | "details"

export function partInspectorTabs(part: ProductionPart | null): PartInspectorTab[] {
  return part && ["audio", "speech"].includes(part.kind)
    ? ["script", "takes", "captions", "details"]
    : ["script", "details"]
}

export function PartInspector({ productionId, part, directory, playingKey, playerPlaying, onClose, onDuplicate, onDelete, onNewTake, onPlay, onChanged }: {
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
}) {
  const [tab, setTab] = useState<PartInspectorTab>("script")
  const data = usePartDetailData(productionId, part, onChanged)
  const recorded = Boolean(part && ["audio", "speech"].includes(part.kind))
  const title = part?.kind === "silence" ? "Silence" : part?.kind === "asset" ? "Venture audio" : part?.kind === "draft" ? "Draft speech" : "Speech Part"
  useEffect(() => {
    const available = new Set(partInspectorTabs(part))
    if (!available.has(tab)) setTab("script")
    else if (part) setTab("script")
  // Part identity and type jointly own the valid tab set.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part?.id, part?.kind])
  return <Sheet open={Boolean(part)} onOpenChange={(open) => { if (!open) onClose() }}>
    <SheetContent className="part-inspector">
      {part && <>
        <SheetHeader><SheetTitle>{title}</SheetTitle><SheetDescription>Part {(part.position ?? 0) + 1} · revision {part.revision || 1}</SheetDescription></SheetHeader>
        <Tabs value={tab} onValueChange={(value) => setTab(value as PartInspectorTab)} className="part-inspector-tabs">
          <TabsList><TabsTrigger value="script">Script</TabsTrigger>{recorded && <TabsTrigger value="takes">Takes {data.takes.length + 1}</TabsTrigger>}{recorded && <TabsTrigger value="captions">Captions {data.captions.length}</TabsTrigger>}<TabsTrigger value="details">Details</TabsTrigger></TabsList>
          <ScrollArea className="part-inspector-scroll">
            <TabsContent value="script"><PartInspectorScript part={part} directory={directory} currentPlaying={playerPlaying && playingKey === `part:${part.id}`} onPlay={onPlay} onNewTake={onNewTake} onDuplicate={onDuplicate} onDelete={onDelete} /></TabsContent>
            {recorded && <TabsContent value="takes"><PartInspectorTakes part={part} takes={data.takes} loading={data.loading} directory={directory} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onNewTake={onNewTake} onPromote={(take) => void data.promote(take)} /></TabsContent>}
            {recorded && <TabsContent value="captions"><PartCaptionPanel captions={data.captions} transcript={data.transcript} languages={directory.config?.languages || []} sourceLanguage={part.language} loading={data.loading} busy={data.captionBusy} confirmation={data.captionConfirmation} job={data.captionJob} onSelect={data.selectTranscript} onCreate={data.makeCaptions} onTranslate={data.translate} onConfirm={data.confirmCaptionAction} onCancel={data.cancelCaptionAction} onRetryJob={data.retryCaptionJob} onDismissJob={data.dismissCaptionJob} /></TabsContent>}
            <TabsContent value="details"><PartInspectorDetails part={part} directory={directory} /></TabsContent>
          </ScrollArea>
        </Tabs>
        {data.message && <div className="part-inspector-message" role="status" aria-live="polite">{data.message}</div>}
        <Dialog open={Boolean(data.takeConfirmation)} onOpenChange={(open) => { if (!open) data.cancelTakeConfirmation() }}><DialogContent><DialogHeader><DialogTitle>Use this outdated Take?</DialogTitle><DialogDescription>This audio was made before the Part’s script or Cast changed. It remains historical and visibly outdated if you select it.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={data.cancelTakeConfirmation}>Cancel</Button><Button onClick={() => void data.confirmTake()}>Use outdated Take</Button></DialogFooter></DialogContent></Dialog>
      </>}
    </SheetContent>
  </Sheet>
}
