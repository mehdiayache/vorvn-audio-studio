import {
  ArrowRight, Clock3, FileAudio2, FolderKanban, Layers3, MoreHorizontal,
  Plus, Search, SlidersHorizontal,
} from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { OperatorTooltip } from "@/components/operator-tooltip"
import { ShellBreadcrumbs } from "@/components/shell-breadcrumbs"
import { VentureMark, isImageIdentity } from "@/components/venture-mark"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { formatDuration, formatMoney, formatUpdated } from "@/lib/format"
import { resourceHref } from "@/lib/links"
import type { ProductionSummary, SeriesSummary, TrailItem, WorkMetrics } from "@/types/domain"

export type WorkSort = "updated" | "name" | "duration"

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function WorkMetric({ value, label, title }: { value: string; label?: string; title?: string }) {
  return <div title={title}>{label && <dt>{label}</dt>}<dd>{value}</dd></div>
}

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
    <div className="work-page-header-inner">
      <ShellBreadcrumbs trail={trail} current={{ type: kind.toLowerCase() as "venture" | "project" | "series", name, icon }} />
      <div className="work-title-row">
        <span className="work-title-icon">{kind === "Venture" ? <VentureMark identity={icon} name={name} /> : imageIcon ? <img src={icon} alt="" /> : <Icon />}</span>
        <div className="work-title-copy"><h1>{name}</h1>{description && <p>{description}</p>}</div>
        {actions && <div className="work-title-actions">{actions}</div>}
      </div>
      {metrics && <dl className="work-metrics">
        {metrics.project_count !== undefined && <WorkMetric value={String(metrics.project_count)} label={metrics.project_count === 1 ? "project" : "projects"} />}
        {metrics.series_count !== undefined && <WorkMetric value={String(metrics.series_count)} label="series" />}
        <WorkMetric value={String(metrics.production_count)} label={metrics.production_count === 1 ? "production" : "productions"} />
        <WorkMetric value={formatDuration(metrics.duration_ms / 1000)} label="audio" />
        <WorkMetric value={formatMoney(metrics.total_cost)} label="historical spend" title="Includes provider spend for work later removed from the edit" />
      </dl>}
    </div>
  </header>
}

export function WorkSection({ title, description, action, children, className = "", count }: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  count?: number
}) {
  return <section className={`work-section ${className}`}>
    <header className="work-section-head"><div><span className="work-section-title"><h2>{title}</h2>{count !== undefined && <small>{count}</small>}</span>{description && <p>{description}</p>}</div>{action}</header>
    {children}
  </section>
}

export function WorkCollectionToolbar({ query, onQueryChange, sort, onSortChange, placeholder, resultCount, actions, sortOptions }: {
  query: string
  onQueryChange: (value: string) => void
  sort: WorkSort
  onSortChange: (value: WorkSort) => void
  placeholder: string
  resultCount: number
  actions?: ReactNode
  sortOptions?: { value: WorkSort; label: string }[]
}) {
  const options = sortOptions || [
    { value: "updated" as const, label: "Recently updated" },
    { value: "name" as const, label: "Name" },
    { value: "duration" as const, label: "Duration" },
  ]
  return <div className="work-collection-toolbar">
    <label className="work-search"><Search /><Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>
    <span className="work-result-count" aria-live="polite">{resultCount} shown</span>
    <Select value={sort} onValueChange={(value) => onSortChange(value as WorkSort)}>
      <SelectTrigger size="sm" aria-label="Sort"><SlidersHorizontal /><SelectValue /></SelectTrigger>
      <SelectContent align="end"><SelectGroup>{options.map((option) => <SelectItem value={option.value} key={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
    {actions}
  </div>
}

export function SeriesCard({ series }: { series: SeriesSummary }) {
  const metrics = series.metrics
  const updated = formatUpdated(series.updated_at)
  const image = isImageIdentity(series.icon)
  return <article className="series-card">
    <Link className="series-card-link" to={resourceHref("series", series.public_id)} aria-label={`Open Series ${series.name}`} />
    <div className={`series-card-art${image ? " has-image" : ""}`}>
      {image ? <img src={series.icon} alt="" /> : <><Layers3 /><b>{series.name.slice(0, 1).toUpperCase()}</b></>}
    </div>
    <div className="series-card-copy"><h3>{series.name}</h3><p>{series.description || "A recurring collection of Productions."}</p><footer><span>{countLabel(metrics.production_count, "production")}</span><span>{formatDuration(metrics.duration_ms / 1000)}</span>{updated && <span>{updated}</span>}</footer></div>
    <ArrowRight className="series-card-open" />
  </article>
}

export function NewResourceTile({ label, description, onClick }: { label: string; description: string; onClick: () => void }) {
  return <button className="new-resource-tile" type="button" onClick={onClick}><span><Plus /></span><b>{label}</b><small>{description}</small></button>
}

export function WorkEmpty({ icon, title, description, action, compact = false }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; compact?: boolean }) {
  return <div className={`work-empty${compact ? " compact" : ""}`}>{icon}<div><h3>{title}</h3>{description && <p>{description}</p>}</div>{action}</div>
}

export function ProductionRow({ production, menu, showContext = false }: { production: ProductionSummary; menu?: ReactNode; showContext?: boolean }) {
  const duration = formatDuration(production.duration_ms / 1000)
  const status = production.status.toLowerCase().replaceAll("_", " ")
  const statusTone = /ready|complete|published/.test(status) ? "ready" : /fail|error|blocked|attention/.test(status) ? "attention" : status === "draft" ? "draft" : "neutral"
  const context = [production.project_name, production.series_name].filter(Boolean).join(" / ")
  return <article className="production-summary-row">
    <Link className="production-summary-main" to={resourceHref("production", production.public_id)}>
      <span className="production-summary-icon"><FileAudio2 /></span>
      <span className="production-summary-copy"><b>{production.name}</b><span className="production-summary-meta"><span className={`work-production-status is-${statusTone}`}><i />{status}</span><small>{countLabel(production.part_count, "part")}</small>{showContext && context && <small className="production-context">{context}</small>}</span></span>
      <span className="production-summary-stats"><b><Clock3 /> {duration}</b><small title="Historical spend">{formatMoney(production.total_cost)}</small></span>
      <ArrowRight className="production-summary-open" />
    </Link>{menu}
  </article>
}

export function ProductionMenu({ children, label }: { children: ReactNode; label: string }) {
  return <DropdownMenu><OperatorTooltip label={label}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={label}><MoreHorizontal /></Button></DropdownMenuTrigger></OperatorTooltip><DropdownMenuContent align="end">{children}</DropdownMenuContent></DropdownMenu>
}

export { DropdownMenuItem }
