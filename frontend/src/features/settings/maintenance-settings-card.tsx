import { HardDrive, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { studioApi } from "@/lib/api"
import type { DiskSnapshot } from "@/types/domain"

const size = (bytes: number) => bytes < 1_000_000 ? `${(bytes / 1000).toFixed(1)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`

export function MaintenanceSettingsCard() {
  const [disk, setDisk] = useState<DiskSnapshot | null>(null)
  const load = () => void studioApi.maintenance().then(setDisk).catch(() => undefined)
  useEffect(load, [])
  return <section className="settings-card settings-wide"><header><HardDrive /><div><h2>Local files</h2><p>Finished files are preserved. Cleanup only removes old working copies.</p></div></header>{disk ? <dl><div><dt>Finished audio</dt><dd>{size(disk.finished.bytes)} · {disk.finished.files} files</dd></div><div><dt>Working files</dt><dd>{size(disk.scratch_total)}</dd></div><div><dt>Folder</dt><dd>{disk.finished.where}</dd></div></dl> : <p>Calculating disk use…</p>}<div className="settings-card-actions"><Button variant="outline" onClick={async () => { const result = await studioApi.tidyWorkingFiles(7); toast.success(`${result.removed} working files removed · ${size(result.freed)} freed.`); load() }}><Trash2 /> Remove working files older than 7 days</Button></div></section>
}
