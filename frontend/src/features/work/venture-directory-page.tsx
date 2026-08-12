import { ArrowRight, Plus, Sparkles } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { VentureMark } from "@/components/venture-mark"
import { ToolPageHeader } from "@/design-system/vorvn"
import { resourceHref } from "@/lib/links"
import type { HierarchyNode } from "@/types/domain"
import { CreateVentureDialog } from "./create-venture-dialog"
import "./work.css"

function descendantsFor(venture: HierarchyNode, items: HierarchyNode[]) {
  const projects = items.filter((item) => (
    item.type === "project" && item.parent_key === venture.key
  ))
  const projectKeys = new Set(projects.map((item) => item.key))
  const seriesKeys = new Set(items.filter((item) => (
    item.type === "series" && projectKeys.has(item.parent_key || "")
  )).map((item) => item.key))
  const productions = items.filter((item) => (
    item.type === "production"
      && (projectKeys.has(item.parent_key || "") || seriesKeys.has(item.parent_key || ""))
  ))
  return { projects, productions }
}

export function VentureDirectoryPage({ items }: { items: HierarchyNode[] }) {
  const [creating, setCreating] = useState(false)
  const ventures = useMemo(
    () => items.filter((item) => item.type === "venture"),
    [items],
  )

  return (
    <main className="work-page work-directory-page">
      <ToolPageHeader
        eyebrow="Audio Studio"
        title="Work"
        description="Ventures organize brands and production boundaries."
        actions={<Button onClick={() => setCreating(true)}><Plus /> New Venture</Button>}
      />
      <section className="venture-directory-grid" aria-label="Ventures">
        {ventures.map((venture) => {
          const { projects, productions } = descendantsFor(venture, items)
          const latestProduction = [...productions].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0]
          return (
            <Link
              className="venture-card"
              to={resourceHref("venture", venture.public_id)}
              key={venture.key}
            >
              <VentureMark
                className="venture-brand-mark"
                identity={venture.icon}
                name={venture.name}
              />
              <div className="venture-card-copy">
                <span className="venture-card-label">Venture</span>
                <h2>{venture.name}</h2>
                <p>{venture.description || "Brand workspace"}</p>
                <footer>
                  <span>{projects.length} Project{projects.length === 1 ? "" : "s"}</span>
                  <span title={latestProduction?.name}>{latestProduction ? `Latest · ${latestProduction.name}` : "No Productions yet"}</span>
                </footer>
              </div>
              <ArrowRight aria-hidden="true" />
            </Link>
          )
        })}
        {!ventures.length && (
          <div className="work-empty">
            <Sparkles />
            <h2>Create your first Venture</h2>
            <p>A Venture is the brand boundary for Projects, Media and Productions.</p>
            <Button onClick={() => setCreating(true)}><Plus /> New Venture</Button>
          </div>
        )}
      </section>
      <CreateVentureDialog open={creating} onOpenChange={setCreating} />
    </main>
  )
}
