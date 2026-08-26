import type { RefObject } from "react"
import { Clapperboard } from "lucide-react"

import "./director-stage.css"

export function DirectorStage({ centerPaneRef }: { centerPaneRef?: RefObject<HTMLElement | null> }) {
  return <main className="ws-center-pane" ref={centerPaneRef}>
    <section className="director-stage" aria-labelledby="director-stage-title">
      <div className="director-stage-mark"><Clapperboard aria-hidden="true" /></div>
      <div>
        <span>Visual workspace</span>
        <h2 id="director-stage-title">Create and collect visual material</h2>
        <p>Director will hold uploads, discoveries and generated visual assets for this Production. These tools are not enabled yet.</p>
      </div>
    </section>
  </main>
}
