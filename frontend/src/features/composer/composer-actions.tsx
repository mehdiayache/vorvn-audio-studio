import { CircleDollarSign, Plus, WandSparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useComposer } from "./composer-controller"

function primaryLabel(composer: ReturnType<typeof useComposer>) {
  if (composer.busy === "generate") return "Generating…"
  if (!composer.productionId) return "Create recording"
  if (composer.part) return `Record Part ${(composer.part.position ?? 0) + 1}`
  return `Generate and add Part ${composer.insertAt === null ? composer.nextPartNumber : composer.insertAt + 1}`
}

export function ComposerActions() {
  const composer = useComposer()
  const blocked = !composer.config?.has_key || !composer.textSession.text.trim() || !composer.currentRoute || Boolean(composer.busy) || composer.taggedIncompatible || composer.recovery.status === "loading" || composer.recovery.status === "conflict"
  return <>
    <footer className="composer-footer">
      <div className="composer-cost" role="status" aria-live="polite">
        <CircleDollarSign />
        <span>{composer.taggedIncompatible ? `${composer.methodLabel} does not use inline tags` : `${composer.textSession.text.length.toLocaleString()} characters`}</span>
        <b>{composer.taggedIncompatible ? "Open Words to remove tags" : composer.currentRoute ? `about $${composer.estimate.toFixed(4)}` : "Choose an exact route"}</b>
        {composer.recovery.status === "saving" && <small>Saving preparation…</small>}
        {composer.recovery.status === "saved" && <small>Preparation saved</small>}
        {composer.recovery.status === "conflict" && <span className="composer-conflict"><small className="composer-save-error">Draft changed in another view</small><Button size="sm" variant="outline" onClick={() => void composer.recovery.reload()}>Reload server draft</Button></span>}
        {composer.recovery.status === "error" && <span className="composer-conflict"><small className="composer-save-error">Preparation could not be saved</small><Button size="sm" variant="outline" onClick={() => void composer.recovery.saveNow()}>Retry save</Button></span>}
      </div>
      <div className="composer-actions">
        {!composer.part && composer.productionId && composer.onSave && <Button variant="outline" disabled={!composer.textSession.text.trim() || !composer.currentRoute || Boolean(composer.busy) || composer.recovery.status === "loading" || composer.recovery.status === "conflict"} onClick={() => void composer.saveDraft().catch(() => undefined)}><Plus />{composer.busy === "draft" ? "Saving…" : "Save Draft"}</Button>}
        <Button disabled={blocked} onClick={() => void composer.generate()}><WandSparkles />{primaryLabel(composer)}</Button>
      </div>
    </footer>
    {!composer.config?.has_key && <p className="composer-warning footer-warning">Add the provider API key in Settings before generating. Drafts still work.</p>}
  </>
}
