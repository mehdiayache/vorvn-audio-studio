import { FileAudio, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { OperatorIconButton } from "@/components/operator-action"
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog"
import { formatMoney } from "@/lib/format"
import type { ExternalTranscriptSummary } from "@/types/domain"

export function SubtitleHistory({ history, error, onOpen, onDelete }: { history: ExternalTranscriptSummary[]; error: string; onOpen: (id: number) => void; onDelete: (item: ExternalTranscriptSummary) => Promise<void> }) {
  const [deleteItem, setDeleteItem] = useState<ExternalTranscriptSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  return <><aside className="subtitles-history"><h2>Previous subtitles</h2>{error && <p className="subtitles-history-error" role="status">Could not refresh this list. Existing results are preserved.</p>}{history.length ? history.map((item) => <article key={item.id}><button onClick={() => onOpen(item.id)}><FileAudio /><span><b>{item.name}</b><small>{item.when} · {item.lines} lines · {formatMoney(item.cost ?? 0)}</small><small>{item.model || "Historical model"}</small></span></button><OperatorIconButton label={`Delete ${item.name}`} detail="Permanently removes this transcription and its subtitle history." size="icon" onClick={() => setDeleteItem(item)}><Trash2 /></OperatorIconButton></article>) : <p>{error ? "Previous subtitles are temporarily unavailable." : "No external subtitles yet."}</p>}</aside>
    <DeleteConfirmationDialog open={Boolean(deleteItem)} onOpenChange={(open) => { if (!open) setDeleteItem(null) }} title={`Delete “${deleteItem?.name || "these subtitles"}”?`} description="This permanently removes this uploaded audio transcription and its generated subtitle history." confirmLabel="Delete subtitles permanently" busy={deleting} onConfirm={() => { if (!deleteItem) return; setDeleting(true); void onDelete(deleteItem).then(() => { setDeleteItem(null); toast.success("Subtitles permanently deleted.") }).catch((reason) => toast.error(reason instanceof Error ? reason.message : "The subtitles could not be deleted.")).finally(() => setDeleting(false)) }} />
  </>
}
