import { CircleDollarSign, Plus, WandSparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useComposer } from "./composer-controller"

function primaryLabel(composer: ReturnType<typeof useComposer>) {
  if (composer.generationState === "recovering") return "Checking current session…"
  if (composer.busy === "generate" || composer.generationState === "active") return "Generating audio…"
  if (!composer.productionId) return "Generate audio"
  if (composer.part?.clip_id) return "Generate again"
  if (composer.part) return `Generate Part ${(composer.part.position ?? 0) + 1}`
  return `Generate and add Part ${composer.insertAt === null ? composer.nextPartNumber : composer.insertAt + 1}`
}

export function ComposerActions() {
  const composer = useComposer()
  const textUnresolved = Boolean(composer.textSession.busy || composer.textSession.review || composer.textSession.pending)
  const ssmlInvalid = composer.enableSsml && !composer.ssmlValidation.valid
  const blocked = !composer.config?.has_key || !composer.textSession.text.trim() || !composer.currentRoute || !composer.outputFormatSupported || Boolean(composer.busy) || Boolean(composer.generationState) || textUnresolved || composer.taggedIncompatible || ssmlInvalid || composer.recovery.status === "loading" || composer.recovery.status === "conflict"
  return <>
    <footer className="composer-footer">
      <div className="composer-cost" role="status" aria-live="polite">
        <CircleDollarSign />
        <span>{composer.taggedIncompatible ? "Tagged version needs a compatible method" : ssmlInvalid ? "SSML needs attention" : `${composer.textSession.text.length.toLocaleString()} characters`}</span>
        <b>{composer.taggedIncompatible ? "Use Spoken or review the tags above" : ssmlInvalid ? "Fix the document before generating" : !composer.outputFormatSupported ? "Choose a supported file type" : composer.currentRoute ? `about $${composer.estimate.toFixed(4)}` : "Choose an exact route"}</b>
        {composer.recovery.status === "saving" && <small>Saving preparation…</small>}
        {composer.recovery.status === "saved" && <small>Preparation saved</small>}
        {composer.recovery.status === "conflict" && <span className="composer-conflict"><small className="composer-save-error">Draft changed in another view</small><Button size="sm" variant="outline" onClick={() => void composer.recovery.reload()}>Reload server draft</Button></span>}
        {composer.recovery.status === "error" && <span className="composer-conflict"><small className="composer-save-error">Preparation could not be saved</small><Button size="sm" variant="outline" onClick={() => void composer.recovery.saveNow()}>Retry save</Button></span>}
      </div>
      <div className="composer-actions">
        {!composer.part && composer.productionId && composer.onSave && <Button variant="outline" disabled={!composer.textSession.text.trim() || !composer.currentRoute || Boolean(composer.busy) || textUnresolved || composer.recovery.status === "loading" || composer.recovery.status === "conflict"} onClick={() => void composer.saveDraft().catch(() => undefined)}><Plus />{composer.busy === "draft" ? "Saving…" : "Save Draft"}</Button>}
        <Button disabled={blocked} onClick={() => void composer.generate()}><WandSparkles />{primaryLabel(composer)}</Button>
      </div>
    </footer>
    {!composer.config?.has_key && <p className="composer-warning footer-warning">Add the provider API key in Settings before generating. Drafts still work.</p>}
  </>
}
