import { CircleDollarSign, Plus, WandSparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useCreator } from "./creator-controller"

function primaryLabel(creator: ReturnType<typeof useCreator>) {
  if (creator.generationState === "recovering") return "Checking current session…"
  if (creator.busy === "generate" || creator.generationState === "active") return "Generating audio…"
  if (!creator.projectId) return "Generate audio"
  if (creator.part?.clip_id) return "Generate again"
  if (creator.part) return `Generate Part ${(creator.part.position ?? 0) + 1}`
  return `Generate and add Part ${creator.insertAt === null ? creator.nextPartNumber : creator.insertAt + 1}`
}

export function CreatorActions() {
  const creator = useCreator()
  const textUnresolved = Boolean(creator.textSession.busy || creator.textSession.review || creator.textSession.pending)
  const ssmlInvalid = creator.enableSsml && !creator.ssmlValidation.valid
  const blocked = !creator.config?.has_key || !creator.textSession.text.trim() || !creator.currentRoute || !creator.outputFormatSupported || Boolean(creator.busy) || Boolean(creator.generationState) || textUnresolved || creator.taggedIncompatible || ssmlInvalid || creator.recovery.status === "loading" || creator.recovery.status === "conflict"
  return <>
    <footer className="creator-footer">
      <div className="creator-cost" role="status" aria-live="polite">
        <CircleDollarSign />
        <span>{creator.taggedIncompatible ? "Tagged version needs a compatible method" : ssmlInvalid ? "SSML needs attention" : `${creator.textSession.text.length.toLocaleString()} characters`}</span>
        <b>{creator.taggedIncompatible ? "Use Spoken or review the tags above" : ssmlInvalid ? "Fix the document before generating" : !creator.outputFormatSupported ? "Choose a supported file type" : creator.currentRoute ? `about $${creator.estimate.toFixed(4)}` : "Choose an exact route"}</b>
        {creator.recovery.status === "saving" && <small>Saving preparation…</small>}
        {creator.recovery.status === "saved" && <small>Preparation saved</small>}
        {creator.recovery.status === "conflict" && <span className="creator-conflict"><small className="creator-save-error">Draft changed in another view</small><Button size="sm" variant="outline" onClick={() => void creator.recovery.reload()}>Reload server draft</Button></span>}
        {creator.recovery.status === "error" && <span className="creator-conflict"><small className="creator-save-error">Preparation could not be saved</small><Button size="sm" variant="outline" onClick={() => void creator.recovery.saveNow()}>Retry save</Button></span>}
      </div>
      <div className="creator-actions">
        {!creator.part && creator.projectId && creator.onSave && <Button variant="outline" disabled={!creator.textSession.text.trim() || !creator.currentRoute || Boolean(creator.busy) || textUnresolved || creator.recovery.status === "loading" || creator.recovery.status === "conflict"} onClick={() => void creator.saveDraft().catch(() => undefined)}><Plus />{creator.busy === "draft" ? "Saving…" : "Save Draft"}</Button>}
        <Button disabled={blocked} onClick={() => void creator.generate()}><WandSparkles />{primaryLabel(creator)}</Button>
      </div>
    </footer>
    {!creator.config?.has_key && <p className="creator-warning footer-warning">Add the provider API key in Settings before generating. Drafts still work.</p>}
  </>
}
