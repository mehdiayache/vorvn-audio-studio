import { FileAudio, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatMoney } from "@/lib/format"
import type { ExternalTranscriptSummary } from "@/types/domain"

export function SubtitleHistory({ history, error, onOpen, onDelete }: { history: ExternalTranscriptSummary[]; error: string; onOpen: (id: number) => void; onDelete: (item: ExternalTranscriptSummary) => void }) {
  return <aside className="subtitles-history"><h2>Previous subtitles</h2>{error && <p className="subtitles-history-error" role="status">Could not refresh this list. Existing results are preserved.</p>}{history.length ? history.map((item) => <article key={item.id}><button onClick={() => onOpen(item.id)}><FileAudio /><span><b>{item.name}</b><small>{item.when} · {item.lines} lines · {formatMoney(item.cost || 0)}</small><small>{item.model || "Historical model"}</small></span></button><Button variant="ghost" size="icon" aria-label={`Delete ${item.name}`} onClick={() => onDelete(item)}><Trash2 /></Button></article>) : <p>{error ? "Previous subtitles are temporarily unavailable." : "No external subtitles yet."}</p>}</aside>
}
