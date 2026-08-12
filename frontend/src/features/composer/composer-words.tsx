import { AudioLines, WandSparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { VoiceLanguageSupport } from "@/components/voice-language-support"
import type { TextView } from "@/hooks/use-composer-text"
import { formatMicroMoney } from "@/lib/format"
import { useComposer } from "./composer-controller"

export function ComposerWords() {
  const composer = useComposer()
  const text = composer.textSession
  const states = ["raw", "shaped", ...(composer.capabilityControls.deliveryTags ? ["tagged" as const] : [])] as TextView[]
  return <section className="composer-section script-section">
    <header>
      <div><span className="eyebrow">Words</span><h3>What should be said?</h3></div>
      <div className="speech-states">{states.map((state) => <Button key={state} variant="ghost" size="sm" className={text.view === state ? "active" : ""} disabled={state !== "raw" && !text.states[state]} onClick={() => text.select(state)}>{state === "raw" ? "Raw" : state === "shaped" ? "Spoken" : "Tagged"}</Button>)}</div>
    </header>
    <div className="script-language-setting">
      <label><span>Language to speak</span><Select value={composer.language} onValueChange={composer.setLanguage}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{composer.languageOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><small>Language never changes the voice or exact route.</small></label>
      {composer.currentRoute && <VoiceLanguageSupport compact route={composer.currentRoute} language={composer.language} customVoice={composer.selectedIdentity?.source === "mine"} />}
    </div>
    {composer.currentRoute && composer.taggedIncompatible && <div className="composer-warning"><b>Inline tags are not available with {composer.methodLabel}.</b><span>Your words remain unchanged until you choose what to do.</span><div>{text.states.shaped && <Button size="sm" variant="outline" onClick={() => text.select("shaped")}>Use Spoken version</Button>}{composer.hasInlineDeliveryTag && <Button size="sm" variant="outline" onClick={composer.removeInlineTags}>Remove inline tags</Button>}</div></div>}
    <Textarea dir="auto" value={text.text} onChange={(event) => text.updateText(event.target.value)} placeholder="Type or paste what should be said…" autoFocus />
    <div className="text-pass-actions">
      <Button variant="outline" disabled={!composer.currentRoute || !text.text.trim() || Boolean(text.busy) || composer.recovery.status === "loading"} onClick={() => void text.run("shape")}><AudioLines />{text.busy === "shape" ? "Rewriting…" : "Make it spoken"}</Button>
      {composer.capabilityControls.deliveryTags ? <>
        <Select value={text.density} onValueChange={text.setDensity}><SelectTrigger aria-label="Tag density"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">Light tags</SelectItem><SelectItem value="normal">Normal tags</SelectItem><SelectItem value="heavy">Heavy tags</SelectItem></SelectContent></Select>
        <Button variant="outline" disabled={!text.text.trim() || Boolean(text.busy) || composer.recovery.status === "loading"} onClick={() => void text.run("tag")}><WandSparkles />{text.busy === "tag" ? "Tagging…" : "Add delivery tags"}</Button>
      </> : <p className="composer-engine-note">{composer.currentRoute ? `${composer.methodLabel} does not use inline tags.` : "Choose an exact route to see its text tools."}</p>}
      <small className="text-pass-cost">Paid text preparation · {composer.config?.text_preparation?.model || "Qwen text"} · about {formatMicroMoney(composer.textPassEstimate)} each</small>
    </div>
    {text.error && <p className="composer-warning">{text.error}</p>}
    {text.review && <div className="text-review"><header><div><b>{text.review.kind === "shape" ? "Spoken version ready" : "Tagged version ready"}</b><span>{formatMicroMoney(Number(text.review.result.cost || 0))} · {text.review.result.cost_basis === "actual_tokens" ? "actual provider tokens" : "estimated"} · review before accepting</span></div><div><Button variant="ghost" onClick={text.reject}>Reject</Button><Button onClick={() => void text.accept()}>Accept version</Button></div></header><p>{text.review.result.difference?.map((change, index) => change.kind === "added" ? <ins key={index}>{change.text}</ins> : change.kind === "removed" ? <del key={index}>{change.text}</del> : <span key={index}>{change.text}</span>)}</p></div>}
  </section>
}
