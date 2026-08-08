import { ArrowRight, Plus, Sparkles } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { VentureMark } from "@/components/venture-mark"
import { resourceHref } from "@/lib/links"
import type { HierarchyNode } from "@/types/domain"
import { CreateVentureDialog } from "./create-venture-dialog"

export function VentureDirectoryPage({ ventures }: { ventures: HierarchyNode[] }) {
  const [creating, setCreating] = useState(false)
  return <main className="work-page venture-directory">
    <header className="directory-header"><div><h1>Ventures</h1></div><Button onClick={() => setCreating(true)}><Plus /> New Venture</Button></header>
    <section className="venture-directory-grid" aria-label="Ventures">
      {ventures.map((venture) => <a className="venture-card" href={resourceHref("venture", venture.id)} key={venture.key}><VentureMark className="venture-brand-mark" identity={venture.icon} name={venture.name} /><div><small>Venture</small><h2>{venture.name}</h2>{venture.description && <p>{venture.description}</p>}<footer><span>{venture.metrics.parts} parts</span><span>{venture.metrics.cost ? `$${venture.metrics.cost.toFixed(2)} spent` : "No spend yet"}</span></footer></div><ArrowRight /></a>)}
      {!ventures.length && <div className="work-empty"><Sparkles /><h2>Create your first Venture</h2><p>A Venture is a brand boundary, not a folder.</p><Button onClick={() => setCreating(true)}><Plus /> New Venture</Button></div>}
    </section>
    <CreateVentureDialog open={creating} onOpenChange={setCreating} />
  </main>
}
