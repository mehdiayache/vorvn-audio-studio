import { Layers3, LoaderCircle, Upload } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { FileDropZone } from "@/components/file-drop-zone"
import { useGlobalPlayer } from "@/components/global-player-provider"
import { OperationState } from "@/components/operation-state"
import { InlineResourceError } from "@/components/state-panel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToolPageHeader } from "@/design-system/vorvn"
import { RecordingSetup, resolveRecordingSetup, type RecordingSetupValue } from "@/features/composer/recording-setup"
import { useJobExecution } from "@/hooks/use-job-execution"
import { useJobQuery } from "@/hooks/use-job-query"
import { useVoiceDirectory } from "@/hooks/use-voice-directory"
import { studioApi } from "@/lib/api"
import type { BatchPreview, BatchResult } from "@/types/domain"

import { BatchColumnMapping, mappedColumn, sameForEveryRow, type BatchColumns } from "./batch-column-mapping"
import { BatchResults } from "./batch-results"
import "./batch-page.css"

const initialColumns: BatchColumns = { text: "0", name: sameForEveryRow, voice: sameForEveryRow, language: sameForEveryRow }

export function BatchPage() {
  const voices = useVoiceDirectory()
  const player = useGlobalPlayer()
  const [jobId, setJobId] = useJobQuery("batch-job")
  const job = useJobExecution<BatchResult>(jobId)
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState<BatchPreview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [setup, setSetup] = useState<RecordingSetupValue>({ identityId: "", route: null, language: "Auto" })
  const [columns, setColumns] = useState<BatchColumns>(initialColumns)
  const [unknownVoices, setUnknownVoices] = useState<Array<{ voice: string; first_row: number }>>([])
  const [mappingBusy, setMappingBusy] = useState(false)
  const notifiedJob = useRef<string | null>(null)

  const resolvedSetup = resolveRecordingSetup(voices.directory, setup)
  const currentRoute = resolvedSetup.route
  const active = Boolean(job && ["queued", "running", "retrying"].includes(job.status))
  const result = job && ["ok", "warning"].includes(job.status) && Array.isArray(job.result?.results) ? job.result : null
  const confirmation = job?.status === "blocked" && job.result?.needs_confirmation && !job.result?.requires_review ? job.result : null

  useEffect(() => {
    if (!sheet) { setUnknownVoices([]); return }
    let current = true
    setMappingBusy(true)
    void studioApi.validateBatchVoiceColumn(sheet.token, mappedColumn(columns.voice))
      .then((check) => { if (current) setUnknownVoices(check.unknown) })
      .catch((reason) => { if (current) setUnknownVoices([{ voice: reason instanceof Error ? reason.message : "Mapping could not be checked", first_row: 0 }]) })
      .finally(() => { if (current) setMappingBusy(false) })
    return () => { current = false }
  }, [columns.voice, sheet])

  useEffect(() => {
    if (!job || notifiedJob.current === job.id || !["ok", "warning", "failed", "lost", "cancelled"].includes(job.status)) return
    notifiedJob.current = job.id
    if (job.status === "ok" || job.status === "warning") toast.success(`${job.result.made || 0} Batch files ready${job.result.failed ? ` · ${job.result.failed} failed` : ""}.`)
    else toast.error(job.error || "Batch generation did not finish.")
  }, [job])

  const payload = useMemo(() => sheet && currentRoute ? {
    token: sheet.token,
    columns: Object.fromEntries(Object.entries(columns).map(([key, value]) => [key, mappedColumn(value)])),
    binding_id: currentRoute.bindingId || null,
    catalogue_voice_id: currentRoute.catalogueVoiceId || null,
    capability_id: setup.route?.capabilityId || null,
    voice_identity_id: currentRoute.bindingId ? resolvedSetup.identity?.identityId || null : null,
    format: "mp3", language: setup.language, instruction: "", rate: 1, pitch: 1, volume: 50,
  } : null, [columns, currentRoute, resolvedSetup.identity, setup.language, setup.route?.capabilityId, sheet])

  async function preview() {
    if (!file) return
    setPreviewBusy(true)
    try {
      const next = await studioApi.previewBatch(file)
      setSheet(next)
      setColumns({ text: String(next.guess.text ?? 0), name: next.guess.name == null ? sameForEveryRow : String(next.guess.name), voice: next.guess.voice == null ? sameForEveryRow : String(next.guess.voice), language: next.guess.language == null ? sameForEveryRow : String(next.guess.language) })
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Spreadsheet could not be read.") }
    finally { setPreviewBusy(false) }
  }

  async function enqueue() {
    if (!payload || unknownVoices.length || mappingBusy) return
    try {
      const next = await studioApi.enqueueBatch(payload)
      setJobId(next.id, false)
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Batch could not be queued.") }
  }

  async function confirm() {
    if (!job) return
    try {
      const next = await studioApi.confirmJob<BatchResult>(job.id)
      setJobId(next.id, false)
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "Batch confirmation failed.") }
  }

  return <main className="batch-page">
    <ToolPageHeader eyebrow="Standalone tool" title="Batch" description="Turn spreadsheet rows into separate recordings with one explicit voice and recording method." />
    {voices.error && voices.config && <InlineResourceError message="Voice directory refresh failed. Existing voice data is preserved." retry={() => void voices.refresh()} />}
    <div className="batch-layout"><div className="batch-main">
      <section className="batch-card"><header><span>1</span><div><h2>Load a spreadsheet</h2><p>Headers are detected automatically. Previewing is free.</p></div></header><FileDropZone file={file} kind="file" accept=".csv,.tsv,.xlsx,.xlsm" disabled={previewBusy || active} onFile={(next) => { setFile(next); setSheet(null); setJobId(null); setUnknownVoices([]) }} hint="CSV, TSV, XLSX or XLSM" emptyLabel="Drop a spreadsheet here" chooseLabel="Choose spreadsheet" /><Button className="batch-preview-button" variant="outline" disabled={!file || previewBusy || active} onClick={() => void preview()}>{previewBusy ? <LoaderCircle className="spin" /> : <Upload />}{previewBusy ? "Reading…" : "Preview rows"}</Button></section>
      {sheet && <section className="batch-card"><header><span>2</span><div><h2>Map columns</h2><p>{sheet.rows} rows · showing the first {sheet.preview.length}{sheet.truncated ? ` · maximum ${sheet.max_rows}` : ""}</p></div></header><BatchColumnMapping sheet={sheet} columns={columns} onChange={setColumns} unknownVoices={unknownVoices} />{mappingBusy && <p className="batch-mapping-check"><LoaderCircle className="spin" /> Checking every route ID…</p>}</section>}
      {sheet && <section className="batch-card"><header><span>3</span><div><h2>Confirm and run</h2><p>Every usable row becomes one independent result. The exact route is never replaced or inferred.</p></div></header><Button disabled={!payload || unknownVoices.length > 0 || mappingBusy || active} onClick={() => void enqueue()}><Layers3 />{active ? "Batch running…" : "Generate Batch"}</Button></section>}
      {job && <OperationState job={job} title="Batch generation" onConfirm={confirmation ? () => void confirm() : undefined} onRetry={job.status === "failed" && payload ? () => void enqueue() : undefined} onDismiss={!active ? () => setJobId(null) : undefined} />}
      {result && jobId && <BatchResults result={result} config={voices.config} player={player} jobId={jobId} />}
    </div><aside className="batch-setup"><h2>Recording setup</h2><RecordingSetup value={setup} config={voices.config} directory={voices.directory} playingKey={player.source?.key} playerPlaying={player.state === "playing"} onPlay={(source) => void player.toggleSource(source)} onChange={setSetup} compact /><p>A mapped Voice column must contain stable binding or catalogue route IDs. Every value is validated before a paid Job is queued.</p></aside></div>
    <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setJobId(null) }}><DialogContent><DialogHeader><DialogTitle>Run this Batch?</DialogTitle><DialogDescription>The complete Batch is estimated at ${Number(confirmation?.estimate || 0).toFixed(4)}. The same exact routes and rows will be used.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setJobId(null)}>Cancel</Button><Button onClick={() => void confirm()}>Confirm and queue</Button></DialogFooter></DialogContent></Dialog>
  </main>
}
