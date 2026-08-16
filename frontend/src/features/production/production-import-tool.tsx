import { AlertCircle, Braces, Check, FileJson2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { FileDropZone } from "@/components/file-drop-zone"
import { VoicePicker } from "@/components/voice-picker"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import type { VoiceIdentityChoice } from "@/lib/voice-options"
import type { PlayerSource, VoiceDirectory } from "@/types/domain"
import {
  parseProductionImportText,
  type ParsedProductionImport,
  type ProductionImportCounts,
  type ProductionImportDocument,
} from "./production-import"

export function ProductionImportTool({ currentPartCount, identities, directory, playingKey, playerPlaying, onPlay, onImport, onImported, onCancel }: {
  currentPartCount: number
  identities: VoiceIdentityChoice[]
  directory: VoiceDirectory
  playingKey?: string
  playerPlaying: boolean
  onPlay: (source: PlayerSource) => void
  onImport: (document: ProductionImportDocument, roleVoices: Record<string, string>) => Promise<ProductionImportCounts>
  onImported: () => void
  onCancel: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedProductionImport | null>(null)
  const [roleVoices, setRoleVoices] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function choose(next: File) {
    setFile(next)
    setParsed(null)
    setRoleVoices({})
    setError("")
    if (!next.name.toLocaleLowerCase().endsWith(".json")) {
      setError("Choose a .json Production document.")
      return
    }
    if (next.size > 5_000_000) {
      setError("This JSON file is larger than 5 MB.")
      return
    }
    try {
      setParsed(parseProductionImportText(await next.text()))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This Production document could not be read.")
    }
  }

  const allRolesMapped = parsed?.roles.every((role) => Boolean(roleVoices[role.name])) ?? false
  const actionLabel = parsed
    ? `${currentPartCount ? "Append" : "Import"} ${parsed.document.items.length} items`
    : "Import items"

  async function runImport() {
    if (!parsed || !allRolesMapped) return
    setBusy(true)
    setError("")
    try {
      const counts = await onImport(parsed.document, roleVoices)
      toast.success(`${counts.items} items appended`, {
        description: `${counts.speech} Speech Drafts · ${counts.silence} Silence Parts`,
      })
      onImported()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The Production could not be imported."
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="production-import-tool">
    <div className="production-import-body">
      <FileDropZone file={file} accept="application/json,.json" kind="file" emptyLabel="Drop a Production JSON here" chooseLabel="Choose JSON" hint="V1 · Speech Drafts and Silence only · maximum 5 MB" disabled={busy} onFile={(next) => void choose(next)} />
      {error && <div className="production-import-error" role="alert"><AlertCircle /><span><b>Import not ready</b>{error}</span></div>}
      {!parsed && !error && <p className="production-import-idle"><Braces /> The file is checked locally first. Nothing is added until you confirm the final button.</p>}
      {parsed && <>
        <section className="production-import-summary" aria-label="Import summary">
          <FileJson2 />
          <div><span className="eyebrow">Ready to map</span><h3>{parsed.document.title}</h3><p>{parsed.speechCount} Speech Drafts · {parsed.silenceCount} Silence Parts · {parsed.roles.length} role{parsed.roles.length === 1 ? "" : "s"}</p></div>
          <Check aria-label="Document valid" />
        </section>
        {parsed.roles.length > 0 && <section className="production-import-roles" aria-label="Role voice mapping">
          <header><div><span className="eyebrow">Voices</span><h3>Map every role</h3></div><p>Choose an existing owned Voice Identity. Recording method stays intentionally unset.</p></header>
          <div>{parsed.roles.map((role) => <div className="production-import-role" key={role.name}>
            <div><code>{role.name}</code><span>{role.count} Speech Part{role.count === 1 ? "" : "s"}</span></div>
            <VoicePicker identities={identities} value={roleVoices[role.name] || ""} directory={directory} label={`Choose Voice for ${role.name}`} playingKey={playingKey} playerPlaying={playerPlaying} onPlay={onPlay} onChange={(identity) => setRoleVoices((current) => ({ ...current, [role.name]: identity.identityId }))} />
          </div>)}</div>
          {!identities.length && <p className="production-import-owned-warning">No active owned Voice is available. Create or restore one before importing Speech.</p>}
        </section>}
      </>}
    </div>
    <DialogFooter className="production-import-footer">
      <span>{parsed && currentPartCount > 0 ? `The current ${currentPartCount} Parts stay in place; this appends after them.` : "Append-only V1 · no provider calls"}</span>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
      <Button type="button" disabled={!allRolesMapped || busy} onClick={() => void runImport()}>{busy ? "Appending…" : actionLabel}</Button>
    </DialogFooter>
  </div>
}
