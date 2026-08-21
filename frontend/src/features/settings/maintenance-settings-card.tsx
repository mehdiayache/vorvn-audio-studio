import { HardDrive, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ActionButton } from "@/components/operator-action"
import { useAsyncAction } from "@/hooks/use-async-action"
import { studioApi } from "@/lib/api"
import type { DiskSnapshot } from "@/types/domain"

const size = (bytes: number) => bytes < 1_000_000 ? `${(bytes / 1000).toFixed(1)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`

export function MaintenanceSettingsCard() {
  const [disk, setDisk] = useState<DiskSnapshot | null>(null)
  const actions = useAsyncAction<"cleanup">()
  const load = () => void studioApi.maintenance().then(setDisk).catch(() => undefined)
  useEffect(load, [])
  const cleanup = () => actions.run("cleanup", async () => {
    try {
      const result = await studioApi.tidyWorkingFiles(7)
      toast.success(`${result.removed} temporary files removed · ${size(result.freed)} freed.`)
      load()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Temporary files could not be removed.")
    }
  })
  return <section className="settings-card settings-wide"><header><HardDrive /><div><h2>Local files</h2><p>Finished audio and cloned-voice masters are protected. Cleanup only removes temporary working copies.</p></div></header>{disk ? <dl><div><dt>Finished audio</dt><dd>{size(disk.finished.bytes)} · {disk.finished.files} files</dd></div><div><dt>Voice masters</dt><dd>{size(disk.protected_total)} · protected</dd></div><div><dt>Temporary files</dt><dd>{size(disk.scratch_total)}</dd></div><div><dt>Media root</dt><dd>{disk.finished.where}</dd></div></dl> : <p>Calculating disk use…</p>}<div className="settings-card-actions"><ActionButton variant="outline" busy={actions.isPending("cleanup")} busyLabel="Removing temporary files…" onClick={() => void cleanup()}><Trash2 /> Remove temporary files older than 7 days</ActionButton></div></section>
}
