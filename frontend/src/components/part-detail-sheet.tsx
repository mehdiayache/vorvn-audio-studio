import { Captions, CircleAlert, Copy, FileAudio, LoaderCircle, Mic2, Pause, Play, Plus, Trash2 } from "lucide-react"

import { PartCaptionPanel } from "@/components/part-caption-panel"
import { RecordingTakeCard } from "@/components/recording-take-card"
import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VoiceIdentity } from "@/components/voice-identity"
import { speechEngineLabel, speechModelLabel } from "@/components/speech-route-label"
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
                <section><h3>Recording</h3><SpeechModelIdentity engine={part.engine} model={part.model} config={directory.config} /><dl><div><dt>Method</dt><dd>{speechEngineLabel(part.engine)}</dd></div><div><dt>Quality</dt><dd>{speechModelLabel(part.model) || "—"}</dd></div><div><dt>Language</dt><dd>{part.language || "Auto"}</dd></div><div><dt>Delivery</dt><dd>{part.speech_mode === "directed" ? "Directed performance" : "Exact reading"}</dd></div></dl></section>
                <Separator />
                <section><h3>Review</h3><div className="detail-badges"><Badge variant={part.subtitled ? "secondary" : "outline"}><Captions /> {part.subtitled ? "Captions available" : "No captions"}</Badge>{part.subtitles_stale && <Badge variant="destructive">Captions need refresh</Badge>}{part.languages?.map((language) => <Badge key={language} variant="outline">{language}</Badge>)}</div></section>
                <div className="detail-actions"><Button variant="outline" onClick={() => onDuplicate(part)}><Copy /> Duplicate</Button><Button variant="outline" className="danger" onClick={() => onDelete(part)}><Trash2 /> Delete</Button></div>
              </div></TabsContent>
              {isRecorded && <TabsContent value="takes"><div className="detail-body"><section><div className="detail-section-head"><h3>Current take</h3><Button onClick={() => onNewTake(part)}><Plus /> Create another take</Button></div><RecordingTakeCard take={{ id: String(part.id), status: part.outdated ? "outdated" : "current", voice: part.voice, voiceIdentityId: part.voice_identity_id, durationMs: Number(part.duration_ms || 0), cost: part.cost, language: part.language, method: speechEngineLabel(part.engine), engine: part.engine, model: part.model, audioUrl: part.filename ? audioUrl(part.filename) : null, message: part.outdated ? "This selected Take was made before the Part changed." : part.fidelity && part.fidelity.status !== "pass" ? part.fidelity.message : undefined }} directory={directory} active={currentPlaying} onPlay={part.filename ? () => onPlay({ key: currentKey, url: audioUrl(part.filename!), title: "Current take", subtitle: resolveVoice(part.voice, directory, part.voice_identity_id).name, kind: "part" }) : undefined} /></section><section><h3>Earlier takes</h3>{loading ? <p className="detail-loading"><LoaderCircle className="spin" /> Loading takes…</p> : takes.length ? takes.map((take) => { const key = `take:${take.id}`; const active = playerPlaying && playingKey === key; return <RecordingTakeCard key={take.id} take={{ id: String(take.id), status: take.outdated ? "outdated" : take.fidelity && take.fidelity.status !== "pass" ? "warning" : "ready", voice: take.voice, voiceIdentityId: take.voice_identity_id, createdAt: take.when, durationMs: Number(take.duration_ms || 0), cost: take.cost, language: take.language, method: speechEngineLabel(take.engine), engine: take.engine, model: take.model, audioUrl: audioUrl(take.filename), message: take.outdated ? `Outdated — made from Part revision ${take.source_part_revision}. Current revision is ${part.revision}.` : take.fidelity && take.fidelity.status !== "pass" ? take.fidelity.message : undefined }} directory={directory} active={active} onPlay={() => onPlay({ key, url: audioUrl(take.filename), title: "Earlier take", subtitle: resolveVoice(take.voice, directory, take.voice_identity_id).name, kind: "part" })} onSecondaryAction={() => void promote(take)} secondaryLabel="Use this take" /> }) : <p className="detail-empty">No earlier takes. Create another take to compare performances without losing this one.</p>}</section></div></TabsContent>}
              {isRecorded && <TabsContent value="captions"><PartCaptionPanel captions={captions} transcript={transcript} languages={directory.config?.languages || []} sourceLanguage={part.language} loading={loading} busy={captionData.captionBusy} confirmation={captionData.captionConfirmation} onSelect={selectTranscript} onCreate={captionData.makeCaptions} onTranslate={captionData.translate} onConfirm={captionData.confirmCaptionAction} onCancel={captionData.cancelCaptionAction} /></TabsContent>}
            </ScrollArea>
          </Tabs>
          {message && <div className="detail-message">{message}</div>}
          <Dialog open={Boolean(captionData.takeConfirmation)} onOpenChange={(open) => { if (!open) captionData.cancelTakeConfirmation() }}><DialogContent><DialogHeader><DialogTitle>Use this older Take?</DialogTitle><DialogDescription>This audio was made before the Part’s words or Cast changed. It can still be selected, but Audio Studio will keep it visibly marked as outdated.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={captionData.cancelTakeConfirmation}>Cancel</Button><Button onClick={() => void captionData.confirmTake()}>Use older Take</Button></DialogFooter></DialogContent></Dialog>
        </>}
      </SheetContent>
    </Sheet>
  )
}
