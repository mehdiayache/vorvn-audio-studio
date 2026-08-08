import { ArrowRight, Clock3, FileAudio2, FolderKanban, Layers3, MoreHorizontal } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ShellBreadcrumbs } from "@/components/shell-breadcrumbs"
import { VentureMark, isImageIdentity } from "@/components/venture-mark"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatDuration, formatMoney, formatUpdated } from "@/lib/format"
import { resourceHref } from "@/lib/links"
import type { ProductionSummary, SeriesSummary, TrailItem, WorkMetrics } from "@/types/domain"

export function WorkPageHeader({ kind, name, description, trail, actions, metrics, icon }: {
  kind: "Venture" | "Project" | "Series"
  name: string
  description: string
  trail?: TrailItem[]
  actions?: ReactNode
  metrics?: WorkMetrics
  icon?: string
}) {
  const Icon = kind === "Project" ? FolderKanban : Layers3
  const imageIcon = isImageIdentity(icon)
  return <header className={`work-page-header work-page-header-${kind.toLowerCase()}`}>
    <ShellBreadcrumbs trail={trail} current={{ type: kind.toLowerCase() as "venture" | "project" | "series", name, icon }} />
    <div className="work-title-row"><span className="work-title-icon">{kind === "Venture" ? <VentureMark identity={icon} name={name} /> : imageIcon ? <img src={icon} alt="" /> : <Icon />}</span><div className="work-title-copy"><small>{kind}</small><h1>{name}</h1>{description && <p>{description}</p>}</div>{actions && <div className="work-title-actions">{actions}</div>}</div>
    {metrics && <div className="work-metrics">{metrics.project_count !== undefined && <span><b>{metrics.project_count}</b> projects</span>}{metrics.series_count !== undefined && <span><b>{metrics.series_count}</b> series</span>}<span><b>{metrics.production_count}</b> productions</span><span><b>{metrics.part_count}</b> parts</span><span><b>{formatDuration(metrics.duration_ms / 1000)}</b> audio</span><span title="Includes spend for work later removed from the edit"><b>{formatMoney(metrics.total_cost)}</b> historical spend</span>{metrics.current_sequence_cost !== undefined && Math.abs(metrics.total_cost - metrics.current_sequence_cost) > 0.000001 && <span title="Only audio currently present in these Productions"><b>{formatMoney(metrics.current_sequence_cost)}</b> current sequences</span>}</div>}
  </header>
}

export function WorkSection({ title, description, action, children, className = "" }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`work-section ${className}`}><header className="work-section-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>{children}</section>
}

export function SeriesCard({ series }: { series: SeriesSummary }) {
  const metrics = series.metrics
  return <a className="series-card" href={resourceHref("series", series.id)}><span className="series-card-mark"><Layers3 /></span><div><small>Series · {metrics.production_count} production{metrics.production_count === 1 ? "" : "s"}</small><h3>{series.name}</h3>{series.description && <p>{series.description}</p>}<footer><span>{metrics.part_count} parts</span><span>{formatDuration(metrics.duration_ms / 1000)}</span><span title="Historical spend">{formatMoney(metrics.total_cost)}</span>{formatUpdated(series.updated_at) && <span>{formatUpdated(series.updated_at)}</span>}</footer></div><ArrowRight /></a>
}

export function ProductionRow({ production, menu }: { production: ProductionSummary; menu?: ReactNode }) {
  const duration = formatDuration(production.duration_ms / 1000)
  return <article className="production-summary-row"><a className="production-summary-main" href={resourceHref("production", production.id)}><span className="production-summary-icon"><FileAudio2 /></span><span className="production-summary-copy"><span><Badge variant="outline">{production.status.replaceAll("_", " ")}</Badge><small>{production.part_count} parts</small>{formatUpdated(production.updated_at) && <small>{formatUpdated(production.updated_at)}</small>}</span><b>{production.name}</b><p>{production.description || "Audio Production"}</p></span><span className="production-summary-stats"><b><Clock3 /> {duration}</b><small title="Historical spend">{formatMoney(production.total_cost)}</small></span><ArrowRight className="production-summary-open" /></a>{menu}</article>
}

export function ProductionMenu({ children, label }: { children: ReactNode; label: string }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={label}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{children}</DropdownMenuContent></DropdownMenu>
}

export { DropdownMenuItem }
