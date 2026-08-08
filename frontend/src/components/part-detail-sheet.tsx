import { Captions, Check, CircleAlert, Copy, FileAudio, LoaderCircle, Mic2, Pause, Play, Plus, RotateCw, Trash2 } from "lucide-react"

import { PartCaptionPanel } from "@/components/part-caption-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VoiceIdentity } from "@/components/voice-identity"
import { usePartDetailData } from "@/hooks/use-part-detail-data"
import { audioUrl } from "@/lib/api"
import { formatDuration, formatMoney, textDirection } from "@/lib/format"
import { resolveVoice } from "@/lib/voice"
import type { PlayerSource, ProductionPart, VoiceDirectory } from "@/types/domain"

import "@/components/part-detail-sheet.css"

export function PartDetailSheet({ productionId, part, directory, playingKey, playerPlaying, onClose, onDuplicate, onDelete, onNewTake, onPlay, onChanged }: {
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
  const captionData = usePartDetailData(productionId, part, onChanged)
  const { takes, captions, transcript, loading, message, selectTranscript, promote } = captionData

  const isRecorded = Boolean(part && ["audio", "speech"].includes(part.kind))
  const currentKey = part ? `part:${part.id}` : ""
  const currentPlaying = playerPlaying && playingKey === currentKey
  return (
    <Sheet open={Boolean(part)} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="detail-sheet">
        {part && <>
          <SheetHeader><SheetTitle>{part.kind === "silence" ? "Silence" : part.kind === "asset" ? "Venture asset" : part.kind === "draft" ? "Draft speech" : "Recorded speech"}</SheetTitle><SheetDescription>Part {(part.position ?? 0) + 1} in the current Production.</SheetDescription></SheetHeader>
          <Tabs defaultValue="summary" className="detail-tabs">
            <TabsList><TabsTrigger value="summary">Summary</TabsTrigger>{isRecorded && <TabsTrigger value="takes">Takes {takes.length + 1}</TabsTrigger>}{isRecorded && <TabsTrigger value="captions">Captions {captions.length}</TabsTrigger>}</TabsList>
            <ScrollArea className="detail-scroll">
              <TabsContent value="summary"><div className="detail-body">
                <div className="detail-summary"><span>{part.kind === "asset" ? <FileAudio /> : <Mic2 />}</span><div>{part.kind === "asset" ? <><b>{part.title || "Venture audio"}</b><p>Linked Venture asset</p></> : <VoiceIdentity voice={part.voice} identityId={part.voice_identity_id} directory={directory} compact />}<p>{formatDuration(Number(part.duration_ms || 0) / 1000)} · {formatMoney(part.spent ?? part.cost)}</p></div><div className="detail-summary-actions">{part.filename && <Button variant="outline" size="icon" aria-label={currentPlaying ? "Pause current part" : "Play current part"} onClick={() => onPlay({ key: currentKey, url: audioUrl(part.filename), title: `Part ${(part.position ?? 0) + 1}`, subtitle: part.kind === "asset" ? "Linked Venture asset" : resolveVoice(part.voice, directory, part.voice_identity_id).name, kind: part.kind === "asset" ? "asset" : "part" })}>{currentPlaying ? <Pause /> : <Play />}</Button>}{["audio", "speech", "draft"].includes(part.kind) && <Button onClick={() => onNewTake(part)}><Plus /> {part.kind === "draft" ? "Record draft" : "New take"}</Button>}</div></div>
                {part.missing && <div className="detail-warning"><CircleAlert /><span><b>Source audio is missing</b><p>Faithful preview and export are blocked until the Venture asset is restored or this part is removed.</p></span></div>}
                {part.fidelity && part.fidelity.status !== "pass" && <div className="detail-warning"><CircleAlert /><span><b>Review the spoken wording</b><p>{part.fidelity.message}{part.fidelity.requested_words ? ` ${part.fidelity.returned_words} of ${part.fidelity.requested_words} compared words were returned.` : ""}</p></span></div>}
                <section><h3>Words</h3><p className="detail-script" dir={textDirection(part.text)}>{part.text || "This part has no written script."}</p></section>
                {part.provider_text && <section><h3>Alibaba returned</h3><p className="detail-script" dir={textDirection(part.provider_text)}>{part.provider_text}</p></section>}
                <Separator />
                <section><h3>Recording</h3><dl><div><dt>Engine</dt><dd>{part.engine || "—"}</dd></div><div><dt>Model</dt><dd>{part.model || "—"}</dd></div><div><dt>Language</dt><dd>{part.language || "Auto"}</dd></div><div><dt>Mode</dt><dd>{part.speech_mode || "Exact"}</dd></div></dl></section>
                <Separator />
                <section><h3>Review</h3><div className="detail-badges"><Badge variant={part.subtitled ? "secondary" : "outline"}><Captions /> {part.subtitled ? "Captions available" : "No captions"}</Badge>{part.subtitles_stale && <Badge variant="destructive">Captions need refresh</Badge>}{part.languages?.map((language) => <Badge key={language} variant="outline">{language}</Badge>)}</div></section>
                <div className="detail-actions"><Button variant="outline" onClick={() => onDuplicate(part)}><Copy /> Duplicate</Button><Button variant="outline" className="danger" onClick={() => onDelete(part)}><Trash2 /> Delete</Button></div>
              </div></TabsContent>
              {isRecorded && <TabsContent value="takes"><div className="detail-body"><section><div className="detail-section-head"><h3>Current take</h3><Button onClick={() => onNewTake(part)}><Plus /> Create another take</Button></div><article className="take-row current"><span><Check /></span><div><b>{resolveVoice(part.voice, directory, part.voice_identity_id).name}</b><small>{formatDuration(Number(part.duration_ms || 0) / 1000)} · {formatMoney(part.cost)}{part.fidelity ? ` · ${part.fidelity.status === "pass" ? "script verified" : "review wording"}` : ""}</small></div>{part.filename && <Button variant="ghost" size="icon" aria-label={currentPlaying ? "Pause current take" : "Play current take"} onClick={() => onPlay({ key: currentKey, url: audioUrl(part.filename), title: "Current take", subtitle: resolveVoice(part.voice, directory, part.voice_identity_id).name, kind: "part" })}>{currentPlaying ? <Pause /> : <Play />}</Button>}</article></section><section><h3>Earlier takes</h3>{loading ? <p className="detail-loading"><LoaderCircle className="spin" /> Loading takes…</p> : takes.length ? takes.map((take) => { const key = `take:${take.id}`; const active = playerPlaying && playingKey === key; return <article className="take-row" key={take.id}><span><RotateCw /></span><div><b>{resolveVoice(take.voice, directory, take.voice_identity_id).name}</b><small>{formatDuration(Number(take.duration_ms || 0) / 1000)} · {new Date(take.when).toLocaleString()} · {formatMoney(take.cost)}{take.fidelity ? ` · ${take.fidelity.status === "pass" ? "script verified" : "review wording"}` : ""}</small></div><Button variant="ghost" size="icon" aria-label={active ? "Pause earlier take" : "Play earlier take"} onClick={() => onPlay({ key, url: audioUrl(take.filename), title: "Earlier take", subtitle: resolveVoice(take.voice, directory, take.voice_identity_id).name, kind: "part" })}>{active ? <Pause /> : <Play />}</Button><Button variant="outline" onClick={() => void promote(take)}>Use this take</Button></article> }) : <p className="detail-empty">No earlier takes. Create another take to compare performances without losing this one.</p>}</section></div></TabsContent>}
              {isRecorded && <TabsContent value="captions"><PartCaptionPanel captions={captions} transcript={transcript} languages={directory.config?.languages || []} sourceLanguage={part.language} loading={loading} busy={captionData.captionBusy} confirmation={captionData.captionConfirmation} onSelect={selectTranscript} onCreate={captionData.makeCaptions} onTranslate={captionData.translate} onConfirm={captionData.confirmCaptionAction} onCancel={captionData.cancelCaptionAction} /></TabsContent>}
            </ScrollArea>
          </Tabs>
          {message && <div className="detail-message">{message}</div>}
        </>}
      </SheetContent>
    </Sheet>
  )
}
