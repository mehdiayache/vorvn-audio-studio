import { Download, Pause, Play } from "lucide-react"

import { SpeechModelIdentity } from "@/components/speech-model-identity"
import { Button } from "@/components/ui/button"
import type { GlobalPlayerValue } from "@/components/global-player-provider"
import type { BatchResult, StudioConfig } from "@/types/domain"

export function BatchResults({ result, config, player, jobId }: {
  result: BatchResult
  config: StudioConfig | null
  player: GlobalPlayerValue
  jobId: string
}) {
  return <section className="batch-card batch-results">
    <header><div><h2>Results</h2><p>{result.made} made · {result.failed} failed · ${Number(result.cost).toFixed(4)}</p><small>Job {jobId}</small></div>{result.zip && <Button variant="outline" asChild><a href={result.zip} download><Download /> Download ZIP</a></Button>}</header>
    {result.results.map((item) => {
      const key = `batch:${jobId}:${item.row}`
      const playing = player.source?.key === key && player.state === "playing"
      return <article key={item.row} className={item.error ? "failed" : ""}>
        <span>{item.row}</span>
        <div><b>{item.name || `Row ${item.row}`}</b><small>{item.error || item.warning || item.text}</small>{item.model && <span className="batch-result-route"><SpeechModelIdentity engine={item.engine} modelId={item.model} config={config} compact />{item.language && <small>{item.language}</small>}</span>}</div>
        {item.url && <Button variant="ghost" size="icon" aria-label={playing ? `Pause ${item.name}` : `Play ${item.name}`} onClick={() => void player.toggleSource({ key, url: item.url!, title: item.name || `Row ${item.row}`, subtitle: item.text, kind: "batch" })}>{playing ? <Pause /> : <Play />}</Button>}
      </article>
    })}
  </section>
}
