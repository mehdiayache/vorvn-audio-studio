import { AlertTriangle, Clock3, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { ToolPageHeader } from "@/design-system/vorvn"
import { formatMoney } from "@/lib/format"
import { studioApi } from "@/lib/api"
import type { ActivityRun, ActivitySnapshot } from "@/types/domain"
import { ActivityDetailSheet } from "./activity-detail-sheet"
import { ActivityRunCard } from "./activity-run-card"
import "./activity-page.css"
import "./activity-detail.css"

export function ActivityPage() {
  const [data, setData] = useState<ActivitySnapshot | null>(null)
  const [error, setError] = useState("")
  const [kind, setKind] = useState("")
  const [failed, setFailed] = useState(false)
  const [limit, setLimit] = useState(30)
  const [selected, setSelected] = useState<ActivityRun | null>(null)
  const refresh = useCallback(async () => {
    try { setData(await studioApi.activity({ kind, failed, limit })); setError("") }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Activity is unavailable.") }
  }, [kind, failed, limit])
  useEffect(() => { void refresh(); const timer = window.setInterval(refresh, 5000); return () => window.clearInterval(timer) }, [refresh])

  return <main className="activity-page">
    <ToolPageHeader eyebrow="Operations and spend" title="Activity" description="Every significant provider operation remains here even when its editable output is removed." actions={<Button variant="outline" onClick={() => void refresh()}><RefreshCw /> Refresh</Button>} />
    {error && <div className="activity-error"><AlertTriangle /> {error}</div>}
    <section className="activity-totals" aria-label="Spend totals"><article><small>Recorded today</small><b>{formatMoney(data?.today || 0)}</b></article><article><small>Recorded this month</small><b>{formatMoney(data?.month || 0)}</b></article><article><small>Recorded all time</small><b>{formatMoney(data?.total || 0)}</b></article><article><small>Operations</small><b>{data?.runs || 0}</b></article></section>
    <p className="activity-accounting-note">Recorded cost combines provider-reported usage, catalogue calculations and historical estimates. Open any operation to see its basis; it is not a provider invoice.</p>
    <section className="activity-section"><header><div><small>Live</small><h2>Running now</h2></div></header>{data?.running.length ? <div className="activity-list">{data.running.map((run) => <ActivityRunCard run={run} onOpen={() => setSelected(run)} key={run.id} />)}</div> : <div className="activity-empty"><Clock3 /><b>Nothing running</b><p>New Jobs will appear here and survive a browser reload.</p></div>}</section>
    <section className="activity-section"><header><div><small>Ledger</small><h2>Recent operations</h2></div><div className="activity-filters"><select aria-label="Filter operation type" value={kind} onChange={(event) => { setKind(event.target.value); setLimit(30) }}><option value="">All operations</option>{Object.entries(data?.kinds || {}).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><Button size="sm" variant={failed ? "secondary" : "outline"} onClick={() => { setFailed(!failed); setLimit(30) }}>Problems only</Button></div></header><div className="activity-list">{data?.runs_list.map((run) => <ActivityRunCard run={run} onOpen={() => setSelected(run)} key={run.id} />)}</div>{data && data.runs_list.length >= limit && limit < 200 && <div className="activity-more"><Button variant="outline" onClick={() => setLimit((value) => Math.min(200, value + 30))}>Load older operations</Button></div>}</section>
    <ActivityDetailSheet run={selected} onClose={() => setSelected(null)} />
  </main>
}
