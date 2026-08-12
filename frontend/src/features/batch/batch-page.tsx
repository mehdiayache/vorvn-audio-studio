import { Download, Layers3, LoaderCircle, Pause, Play, Upload } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { FileDropZone } from "@/components/file-drop-zone"
import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"
import { studioApi } from "@/lib/api"
import { RecordingSetup, resolveRecordingSetup, type RecordingSetupValue } from "@/features/composer/recording-setup"
import type { VoiceChoice } from "@/lib/voice-options"
import type { BatchPreview, BatchResult } from "@/types/domain"

import "./batch-page.css"

const none = "__same__"

export function BatchPage() {
  const voices = useVoiceDirectory()
  const player = useGlobalPlayer()
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState<BatchPreview | null>(null)
  const [busy, setBusy] = useState<"preview" | "run" | null>(null)
  const [setup, setSetup] = useState<RecordingSetupValue>({ identityId: "", route: null, language: "Auto" })
  const [columns, setColumns] = useState({ text: "0", name: none, voice: none, language: none })
  const [result, setResult] = useState<BatchResult | null>(null)
  const [resultSetup, setResultSetup] = useState<{ voice: string; language: string; route: VoiceChoice } | null>(null)
  const [pendingEstimate, setPendingEstimate] = useState<number | null>(null)

  const resolvedSetup = resolveRecordingSetup(voices.directory, setup)
  const selectedIdentity = resolvedSetup.identity
  const currentRoute = resolvedSetup.route

  const preview = async () => {
    if (!file) return
    setBusy("preview"); setResult(null)
    try {
      const next = await studioApi.previewBatch(file)
      setSheet(next)
      setColumns({ text: String(next.guess.text ?? 0), name: next.guess.name == null ? none : String(next.guess.name), voice: next.guess.voice == null ? none : String(next.guess.voice), language: next.guess.language == null ? none : String(next.guess.language) })
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Spreadsheet could not be read.") }
    finally { setBusy(null) }
  }

  const run = async (confirmed = false) => {
    if (!sheet || !currentRoute) return
    setBusy("run")
    try {
      const next = await studioApi.runBatch({ token: sheet.token, columns: Object.fromEntries(Object.entries(columns).map(([key, value]) => [key, value === none ? null : Number(value)])), binding_id: currentRoute.bindingId || null, catalogue_voice_id: currentRoute.catalogueVoiceId || null, capability_id: setup.route?.capabilityId || null, voice_identity_id: selectedIdentity?.source === "mine" ? selectedIdentity.identityId : null, format: "mp3", language: setup.language, instruction: "", rate: 1, pitch: 1, volume: 50, confirmed })
      if (next.needs_confirmation) { setPendingEstimate(next.estimate || 0); return }
      setResult(next)
      setResultSetup({ voice: selectedIdentity?.name || "Voice", language: setup.language, route: currentRoute })
      toast.success(`${next.made} files ready${next.failed ? ` · ${next.failed} failed` : ""}.`)
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Batch failed.") }
    finally { setBusy(null) }
  }

  const mapped = (value: string) => value === none ? null : Number(value)
  const textColumn = mapped(columns.text) ?? 0
  const nameColumn = mapped(columns.name)

  return <main className="batch-page">
    <header className="batch-hero"><span><Layers3 /></span><div><small>Standalone tool</small><h1>Batch</h1><p>Turn rows from CSV, TSV or Excel into separate recordings with one controlled setup.</p></div></header>
    <div className="batch-layout"><div className="batch-main">
      <section className="batch-card"><header><span>1</span><div><h2>Load a spreadsheet</h2><p>Headers are detected automatically. Previewing is free.</p></div></header><FileDropZone file={file} kind="file" accept=".csv,.tsv,.xlsx,.xlsm" disabled={Boolean(busy)} onFile={(next) => { setFile(next); setSheet(null); setResult(null) }} hint="CSV, TSV, XLSX or XLSM" emptyLabel="Drop a spreadsheet here" chooseLabel="Choose spreadsheet" /><Button className="batch-preview-button" variant="outline" disabled={!file || Boolean(busy)} onClick={() => void preview()}>{busy === "preview" ? <LoaderCircle className="spin" /> : <Upload />}{busy === "preview" ? "Reading…" : "Preview rows"}</Button></section>
      {sheet && <section className="batch-card"><header><span>2</span><div><h2>Map columns</h2><p>{sheet.rows} rows · showing the first {sheet.preview.length}{sheet.truncated ? ` · maximum ${sheet.max_rows}` : ""}</p></div></header><div className="batch-mapping">{(["text", "name", "voice", "language"] as const).map((key) => <label key={key}><span>{key === "text" ? "Words to speak" : key === "name" ? "File name" : key === "voice" ? "Voice per row" : "Language per row"}</span><Select value={columns[key]} onValueChange={(value) => setColumns((current) => ({ ...current, [key]: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{key !== "text" && <SelectItem value={none}>Same for every row</SelectItem>}{sheet.headers.map((header, index) => <SelectItem value={String(index)} key={`${header}-${index}`}>{header}</SelectItem>)}</SelectContent></Select></label>)}</div>{mapped(columns.voice) === sheet.guess.voice && sheet.voices.unknown.length > 0 && <p className="batch-warning">{sheet.voices.unknown.length} unknown voice value(s) were found in the selected voice column. Remap it before generating.</p>}<div className="batch-table"><table><thead><tr><th>Output file</th><th>Words</th></tr></thead><tbody>{sheet.preview.map((row, index) => { const words = (row[textColumn] || "").trim(); const label = nameColumn == null ? `row-${index + 2}` : (row[nameColumn] || `row-${index + 2}`).trim(); return <tr key={index}><td>{label}.mp3</td><td className={!words ? "empty" : ""}>{words || "Empty — skipped"}</td></tr> })}</tbody></table></div></section>}
      {sheet && <section className="batch-card"><header><span>3</span><div><h2>Check and run</h2><p>Every usable row becomes one independent file. Empty rows are skipped.</p></div></header><Button disabled={!currentRoute || Boolean(busy)} onClick={() => void run()}>{busy === "run" ? <LoaderCircle className="spin" /> : <Layers3 />}{busy === "run" ? "Generating rows…" : "Generate Batch"}</Button></section>}
      {result && <section className="batch-card batch-results"><header><div><h2>Results</h2><p>{result.made} made · {result.failed} failed · ${Number(result.cost).toFixed(4)}</p>{resultSetup && <div className="batch-result-setup"><span>{resultSetup.voice} · {resultSetup.language}</span><SpeechModelIdentity engine={resultSetup.route.engine} tier={resultSetup.route.model} modelId={resultSetup.route.modelId} config={voices.config} /></div>}</div>{result.zip && <Button variant="outline" asChild><a href={result.zip} download><Download /> Download ZIP</a></Button>}</header>{result.results.map((item) => { const key = `batch:${sheet?.token}:${item.row}`; const playing = player.source?.key === key && player.state === "playing"; return <article key={item.row}><span>{item.row}</span><div><b>{item.name || `Row ${item.row}`}</b><small>{item.error || item.warning || item.text}</small></div>{item.url && <Button variant="ghost" size="icon" aria-label={playing ? `Pause ${item.name}` : `Play ${item.name}`} onClick={() => void player.toggleSource({ key, url: item.url!, title: item.name || `Row ${item.row}`, subtitle: item.text, kind: "batch" })}>{playing ? <Pause /> : <Play />}</Button>}</article> })}</section>}
    </div><aside className="batch-setup"><h2>Recording setup</h2><RecordingSetup value={setup} config={voices.config} directory={voices.directory} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onPlay={(source) => void player.toggleSource(source)} onChange={setSetup} compact /><p>A mapped voice column can provide an exact route per row. Unresolved values are blocked before generation.</p></aside></div>
    <Dialog open={pendingEstimate !== null} onOpenChange={(open) => { if (!open) setPendingEstimate(null) }}><DialogContent><DialogHeader><DialogTitle>Run this Batch?</DialogTitle><DialogDescription>The complete batch is estimated at ${Number(pendingEstimate || 0).toFixed(4)}.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setPendingEstimate(null)}>Cancel</Button><Button onClick={() => { setPendingEstimate(null); void run(true) }}>Generate rows</Button></DialogFooter></DialogContent></Dialog>
  </main>
}
